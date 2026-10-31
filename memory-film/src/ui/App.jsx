// MEMORIA 기념영상 스튜디오 — 메인 화면
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore, setPath, photoMeta, setPhotoMeta } from './store.js';
import { buildTimeline, activeAt } from '../engine/timeline.js';
import { planSelection, clearSelection } from '../engine/select.js';
import { analyzePhotos } from '../engine/quality.js';
import { magicProject } from '../engine/magic.js';
import { MagicModal } from './Magic.jsx';
import { HelpModal } from './Help.jsx';
import { AudioPreview } from '../engine/audio.js';
import { newId, normalizeProject, defaultProject, applyTemplate, TEMPLATES, MONTAGE_STYLES } from '../engine/presets.js';
import { fmtTime } from '../engine/math.js';
import { importPaths, importWebFiles, mergeItems, defaultVideoName, estimateSizeMB, musicLength, sortPhotos } from './logic.js';
import { api, isDesktop, baseName } from '../platform.js';
import { Preview } from './Preview.jsx';
import { Filmstrip } from './Filmstrip.jsx';
import { Inspector } from './Inspector.jsx';
import { ExportModal } from './ExportModal.jsx';
import { PhotosPanel, TextPanel, StylePanel, MusicPanel, ExportPanel, TemplateGallery } from './panels.jsx';
import { Icon, Button, Segmented, keepSave } from './controls.jsx';

const STEP_NEXT = {
  photos: ['text', '다음: 인트로·문구 입력'],
  text: ['style', '다음: 색감·글꼴·전환 고르기'],
  style: ['music', '다음: 배경음악 넣기'],
  music: ['export', '다음: 영상 파일 만들기'],
};

/** 단계 하단 안내: 처음 쓰는 사람도 순서대로 따라가면 완성 */
function StepFooter({ step, setStep, hasPhotos }) {
  const nx = STEP_NEXT[step];
  if (!nx) return null;
  return (
    <div className="step-footer">
      <button className="next-btn" onClick={() => setStep(nx[0])} disabled={step === 'photos' && !hasPhotos} title={step === 'photos' && !hasPhotos ? '먼저 사진을 불러오세요' : ''}>
        {nx[1]} <span>→</span>
      </button>
    </div>
  );
}

/** 미리보기 아래에 표시할 현재 장면 이름 */
function sceneLabel(tl, key, project) {
  if (!key) return '';
  if (key === 'intro') return '인트로';
  if (key === 'outro') return '엔딩';
  const photos = project.items.filter((i) => i.type === 'photo' && !i.skip);
  if (key.startsWith('g:')) {
    const g = tl.segments.find((s) => s.key === key);
    if (!g) return '';
    const a = photos.indexOf(g.items[0]) + 1;
    return `몽타주 · ${MONTAGE_STYLES[g.style]?.name || ''} · 사진 ${a}–${a + g.items.length - 1} / ${photos.length}`;
  }
  const it = project.items.find((i) => i.id === key);
  if (!it) return '';
  if (it.type === 'chapter') return `챕터 · ${it.title || ''}`;
  const n = photos.indexOf(it) + 1;
  return `사진 ${n} / ${photos.length}${it.label || it.caption ? ' · ' + [it.label, it.caption].filter(Boolean).join(' ') : ''}`;
}

const STEPS = [
  ['photos', '사진', 'photo'],
  ['text', '문구', 'text'],
  ['style', '스타일', 'palette'],
  ['music', '음악', 'music'],
  ['export', '내보내기', 'export'],
];

export default function App() {
  const store = useProjectStore();
  const { project, update, undo, redo } = store;
  const tl = useMemo(() => buildTimeline(project), [project]);
  const [step, setStep] = useState('photos');
  const [selected, setSelected] = useState(() => new Set());
  const [activeKey, setActiveKey] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [exportJob, setExportJob] = useState(null); // { path, draft }
  const [quality, setQuality] = useState('standard');
  const [dragOver, setDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(() => !store.restored && !store.project.items.length && !store.project.template);
  const [previewReq, setPreviewReq] = useState(null);
  const [compact, setCompact] = useState(false);
  const [busy, setBusy] = useState(null); // { text, done, total }
  const [showMagic, setShowMagic] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const busyCancel = useRef(false);
  const busyRef = useRef(false);
  busyRef.current = !!busy || showMagic;
  const autoSelectRef = useRef(null);
  const previewRef = useRef(null);
  const audio = useMemo(() => new AudioPreview(), []);
  const fileInput = useRef(null);
  const audioInput = useRef(null);
  const lastSel = useRef(null);
  const tlRef = useRef(tl);
  tlRef.current = tl;
  const projectRef = useRef(project);
  projectRef.current = project;

  const toast = useCallback((text, level = 'ok', action) => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, level, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 9000 : 4200);
  }, []);

  useEffect(() => {
    if (store.restored) {
      toast('이전에 작업하던 내용을 불러왔습니다', 'info', {
        label: '새로 시작',
        run: () => store.replace(defaultProject()),
      });
      store.clearRestored();
      checkMissing(store.project);
    }
  }, []);

  // ------------------------------------------------ 가져오기
  const addItems = useCallback(
    ({ items, skipped }, atIndex = null) => {
      if (!items.length && !skipped.length) return toast('가져올 사진이 없습니다', 'warn');
      // 결과(추가된 장수)를 바로 알아야 하므로 현재 상태로 먼저 계산한 뒤 반영
      const p = projectRef.current;
      let afterId = null;
      if (atIndex != null && atIndex > 0) afterId = p.items[atIndex - 1]?.id;
      const r = mergeItems(p, items, afterId);
      if (atIndex === 0) {
        const fresh = r.project.items.slice(p.items.length);
        r.project.items = [...fresh, ...p.items];
      }
      const { added, dup } = r;
      update(r.project);
      projectRef.current = r.project;
      setTimeout(() => {
        let msg = `사진 ${added}장을 추가했습니다`;
        if (dup) msg += ` · 중복 ${dup}장 제외`;
        if (skipped.length) {
          const heicFail = skipped.filter((s) => /HEIC/.test(s.reason)).length;
          msg += ` · 읽을 수 없는 파일 ${skipped.length}장 제외`;
          if (heicFail) msg += ` (HEIC ${heicFail}장 변환 실패)`;
          else if (skipped.some((s) => /RAW|CR2|NEF|ARW|DNG|PSD|TIF/.test(s.reason))) msg += ' (RAW·PSD·TIFF는 JPG로 저장해 넣어 주세요)';
        }
        toast(msg, skipped.length ? 'warn' : 'ok');
      }, 0);
      // 사진이 많아 영상이 길어지면: 클릭 한 번으로 '3분 영상 + 좋은 사진만' 제안
      setTimeout(() => {
        const p = projectRef.current;
        const n = p.items.filter((i) => i.type === 'photo' && !i.skip).length;
        const total = tlRef.current.total;
        if (added && n >= 40 && total > 360 && p.style.lengthMode !== 'total')
          toast(`사진 ${n}장 → 영상이 약 ${Math.round(total / 60)}분입니다`, 'info', { label: '3분 영상으로 좋은 사진만 고르기', run: () => autoSelectRef.current?.(180, 3) });
      }, 400);
    },
    [toast, update],
  );

  const busyToast = () => toast('사진을 찾는 중입니다…', 'info');

  const actions = useMemo(
    () => ({
      importFolder: async (recursive) => {
        if (!isDesktop) return fileInput.current?.click();
        const folder = await api.pickFolder();
        if (!folder) return;
        setBusy({ text: '사진을 불러오는 중…', done: 0, total: 0, scan: true });
        try {
          addItems(await importPaths([folder], recursive));
        } finally {
          setBusy(null);
        }
      },
      importFiles: async () => {
        if (!isDesktop) return fileInput.current?.click();
        const paths = await api.pickPhotos();
        if (!paths.length) return;
        addItems(await importPaths(paths));
      },
      addChapter: (refId, before) => {
        const id = newId('c');
        update((p) => {
          const items = p.items.slice();
          const anchor = (typeof refId === 'string' && refId) || [...selected].find((s) => items.some((i) => i.id === s));
          let idx = anchor ? items.findIndex((i) => i.id === anchor) + (before ? 0 : 1) : items.length;
          if (idx < 0) idx = items.length;
          items.splice(idx, 0, { id, type: 'chapter', title: '', subtitle: '' });
          return { ...p, items };
        });
        setSelected(new Set([id]));
        toast('챕터 카드를 넣었습니다. 오른쪽에서 제목을 입력하세요.');
      },
      deleteSelected: () => {
        const removed = project.items.map((it, idx) => ({ it, idx })).filter(({ it }) => selected.has(it.id));
        if (!removed.length) return;
        update((p) => ({ ...p, items: p.items.filter((i) => !selected.has(i.id)) }));
        setSelected(new Set());
        // 되돌리기: 그 사이 다른 편집을 했어도 삭제한 항목만 원래 위치에 복원
        toast(`${removed.length}개 항목을 삭제했습니다`, 'info', {
          label: '되돌리기',
          run: () =>
            update((p) => {
              const items = p.items.slice();
              const have = new Set(items.map((i) => i.id));
              for (const { it, idx } of removed) if (!have.has(it.id)) items.splice(Math.min(idx, items.length), 0, it);
              return { ...p, items };
            }),
        });
      },
      openTemplates: () => setShowTemplates(true),
      addLibraryTrack: (t) => addTrack(t.path, t.title, { libId: t.id, license: t.license, ...(t.needsCredit ? { needsCredit: true, credit: t.credit } : {}) }),
      autoSelect: (target, per) => autoSelectRef.current?.(target, per),
      clearSelection: () => {
        update((p) => clearSelection(p));
        toast('모든 사진을 다시 사용합니다');
      },
      sortByDate: async () => {
        // 촬영일 정보가 없던 사진은 폴더·파일 이름의 연도로 날짜를 다시 계산한 뒤 정렬
        let fixed = new Map();
        const weak = projectRef.current.items.filter((i) => i.type === 'photo' && (!i.dateSource || i.dateSource === 'file') && !/^(blob:|data:)/.test(i.path));
        if (isDesktop && api.photoDates && weak.length) {
          const r = await api.photoDates(weak.map((i) => i.origPath || i.path));
          weak.forEach((it, k) => r[k] && r[k].dateSource !== 'file' && fixed.set(it.id, r[k]));
        }
        update((p) => sortPhotos({ ...p, items: p.items.map((i) => (fixed.has(i.id) ? { ...i, ...fixed.get(i.id) } : i)) }, 'date'));
        toast(fixed.size ? `촬영일 순으로 정렬했습니다 · 촬영일 정보가 없던 ${fixed.size}장은 폴더·파일 이름의 연도를 사용` : '촬영일 순으로 정렬했습니다');
      },
      /** 입력 중인 문구가 보이는 장면으로 미리보기 이동 (재생 중이 아닐 때) */
      peek: (kind) => {
        const s = tlRef.current.segments.find((x) => x.type === kind);
        if (!s) return;
        const f = kind === 'intro' ? 0.62 : kind === 'credits' ? 0.3 : 0.6;
        previewRef.current?.pause(); // 입력하는 동안 글자가 보이는 화면에 멈춰 있도록
        previewRef.current?.seek(s.start + Math.min(s.dur - s.tOut - 0.1, s.dur * f));
      },
      previewOutro: () => {
        const s = tlRef.current.segments.find((x) => x.type === 'outro');
        if (s) previewRef.current?.playRange(s.start, s.start + s.dur);
      },
      resetTransitions: () => {
        update((p) => ({ ...p, intro: { ...p.intro, transition: 'auto' }, items: p.items.map((i) => (i.transition && i.transition !== 'auto' ? { ...i, transition: 'auto' } : i)) }));
        toast('모든 전환을 자동으로 되돌렸습니다');
      },
      addMusic: async () => {
        if (!isDesktop) return audioInput.current?.click();
        const paths = await api.pickAudio();
        for (const path of paths) await addTrack(path, baseName(path));
      },
      pickLogo: async () => {
        if (!isDesktop) return toast('PC 버전에서 사용할 수 있습니다', 'warn');
        const p = await api.pickImage();
        if (p) update((pr) => setPath(pr, 'text.logo', p));
      },
      previewIntro: () => {
        previewRef.current?.seek(0);
        previewRef.current?.play();
      },
      goStep: setStep,
      startExport: async (draft = false) => {
        // 매번 저장 위치를 확인 (이전 영상을 실수로 덮어쓰지 않도록)
        const base = project.output.path ? baseName(project.output.path) : defaultVideoName(project);
        const name = draft ? base.replace(/(_시안)?\.mp4$/i, '_시안.mp4') : base.replace(/_시안\.mp4$/i, '.mp4');
        const out = await api.saveVideoDialog(name);
        if (!out) return;
        // 디스크 여유 공간 확인 (예상 용량의 1.5배 + 200MB)
        const need = (draft ? estimateSizeMB({ ...project, output: { ...project.output, resolution: '720p', quality: 'standard' } }, tlRef.current.total) : estimateSizeMB(project, tlRef.current.total)) * 1.5 + 200;
        const free = await api.freeSpace?.(out);
        if (free > 0 && free / 1048576 < need) {
          toast(`저장 위치의 남은 공간(${Math.round(free / 1048576)}MB)이 부족합니다. 약 ${Math.round(need)}MB가 필요합니다. 다른 드라이브를 선택해 주세요.`, 'error');
          return;
        }
        if (!draft) update((p) => setPath(p, 'output.path', out));
        previewRef.current?.pause();
        setExportJob({ path: out, draft });
      },
    }),
    [addItems, project, selected, toast, undo, update],
  );

  const addTrack = async (path, name, extra = {}) => {
    try {
      const duration = await audio.load(path);
      update((p) => setPath(p, 'music.tracks', [...p.music.tracks, { path, name, duration, ...extra }]));
      if (extra.libId) {
        // 라이브러리 곡이 영상보다 짧으면 자동으로 반복 재생
        const ml = musicLength({ ...projectRef.current.music, tracks: [...projectRef.current.music.tracks, { duration }] });
        if (ml < tlRef.current.total - 1 && !projectRef.current.music.loop) {
          update((p) => setPath(p, 'music.loop', true));
          return toast(`‘${name}’ 추가 · 영상(${fmtTime(tlRef.current.total)})보다 짧아 자동으로 반복합니다`, 'ok', {
            label: '대신 영상 길이를 음악에 맞추기',
            run: () => update((p) => ({ ...p, music: { ...p.music, loop: false }, style: { ...p.style, lengthMode: 'total', targetDuration: Math.round(musicLength(p.music) * 10) / 10 } })),
          });
        }
      }
      const hasPhotos = projectRef.current.items.some((i) => i.type === 'photo');
      if (hasPhotos && projectRef.current.style.lengthMode !== 'total')
        toast(`‘${name}’ 추가 (${fmtTime(duration)})`, 'ok', {
          label: '영상 길이를 음악에 맞추기',
          run: () =>
            update((p) => {
              const ml = musicLength(p.music);
              return ml > 0 ? { ...p, style: { ...p.style, lengthMode: 'total', targetDuration: Math.round(ml * 10) / 10 } } : p;
            }),
        });
      else toast(`‘${name}’ 추가 (${fmtTime(duration)})`);
    } catch {
      toast(`‘${name}’ 파일을 읽을 수 없습니다`, 'error');
    }
  };

  const onDropFiles = useCallback(
    async (files, atIndex = null) => {
      if (busyRef.current) return; // 분석·불러오기 중에는 무시 (결과가 덮여 사라지지 않게)
      if (isDesktop) {
        const paths = [...files].map((f) => api.pathForFile(f)).filter(Boolean);
        const audioPaths = paths.filter((p) => /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(p));
        for (const ap of audioPaths) await addTrack(ap, baseName(ap));
        const rest = paths.filter((p) => !audioPaths.includes(p));
        if (rest.length) {
          busyToast();
          addItems(await importPaths(rest), atIndex);
        }
      } else addItems(importWebFiles(files), atIndex);
    },
    [addItems],
  );

  // ------------------------------------------------ 프로젝트 저장/열기
  const checkMissing = async (p) => {
    if (!isDesktop) return;
    const photos = p.items.filter((i) => i.type === 'photo');
    const ex = await api.exists(photos.map((i) => i.path));
    let miss = 0;
    photos.forEach((ph, i) => {
      setPhotoMeta(ph.path, { missing: !ex[i] });
      if (!ex[i]) miss++;
    });
    if (miss) toast(`원본 사진 ${miss}장을 찾을 수 없습니다 (폴더를 옮겼거나 삭제됨)`, 'error', { label: '사진 폴더 다시 찾기', run: () => relink() });
  };

  /** 사진 폴더를 옮긴 경우: 새 위치의 폴더를 고르면 같은 이름의 사진을 찾아 다시 연결 */
  const relink = async () => {
    const p0 = projectRef.current;
    const photos = p0.items.filter((i) => i.type === 'photo');
    const ex = await api.exists(photos.map((i) => i.path));
    const missing = photos.filter((_, k) => !ex[k]).map((i) => ({ path: i.path, name: i.name, size: i.size }));
    if (!missing.length) return toast('찾을 수 없는 사진이 없습니다');
    const folder = await api.pickFolder();
    if (!folder) return;
    setBusy({ text: '옮겨진 사진을 찾는 중…', done: 0, total: 0 });
    const map = await api.relinkPhotos(missing, folder).finally(() => setBusy(null));
    const n = Object.keys(map).length;
    if (!n) return toast('그 폴더에서 같은 이름의 사진을 찾지 못했습니다', 'warn');
    update((p) => ({ ...p, items: p.items.map((i) => (map[i.path] ? { ...i, path: map[i.path] } : i)) }));
    for (const np of Object.values(map)) setPhotoMeta(np, { missing: false });
    toast(n === missing.length ? `사진 ${n}장을 모두 다시 연결했습니다` : `사진 ${n}장을 다시 연결했습니다 · ${missing.length - n}장은 아직 찾지 못함`, n === missing.length ? 'ok' : 'warn');
  };

  const save = async (as = false) => {
    if (!isDesktop) {
      toast('PC 버전에서 저장할 수 있습니다', 'warn');
      return false;
    }
    const json = JSON.stringify({ app: 'MEMORIA', savedAt: new Date().toISOString(), project }, null, 1);
    let p = null;
    try {
      p = await api.saveProject(json, as ? null : store.filePath, project.name);
    } catch (e) {
      p = { error: '저장하지 못했습니다: ' + (e?.message || e) };
    }
    if (p && p.error) {
      toast(p.error, 'error', { label: '다른 이름으로 저장', run: () => saveRef.current(true) });
      return false;
    }
    if (p) {
      store.markSaved(p);
      toast('프로젝트를 저장했습니다');
      return true;
    }
    return false;
  };

  // ------------------------------------------------ 음악 박자 분석 (곡을 넣거나 프로젝트를 열면 자동)
  const beatJobs = useRef(new Set());
  useEffect(() => {
    for (const t of project.music.tracks) {
      if (t.beats || t.beatsFailed || beatJobs.current.has(t.path)) continue;
      beatJobs.current.add(t.path);
      audio
        .analyzeBeats(t.path)
        .then((r) => ({ beats: r.beats, beatStrength: r.strength, bpm: r.bpm, beatConf: r.confidence }))
        .catch(() => ({ beatsFailed: true }))
        .then((patch) => {
          beatJobs.current.delete(t.path);
          store.patch((p) => ({ ...p, music: { ...p.music, tracks: p.music.tracks.map((x) => (x.path === t.path && !x.beats ? { ...x, ...patch } : x)) } }));
        });
    }
  }, [project.music.tracks, audio, store.patch]);

  // ------------------------------------------------ 자동 사진 선별
  const autoSelect = async (target, per) => {
    const need = projectRef.current.items.filter((i) => i.type === 'photo' && typeof i.q !== 'number');
    let qs = new Map();
    if (need.length) {
      busyCancel.current = false;
      setBusy({ text: '사진 화질(선명도·밝기) 분석 중…', done: 0, total: need.length });
      qs = await analyzePhotos(need, (d, t) => d % 3 === 0 || d === t ? setBusy((b) => b && { ...b, done: d }) : null, () => busyCancel.current);
      setBusy(null);
      if (busyCancel.current) return toast('자동 선별을 취소했습니다', 'info');
    }
    const p0 = projectRef.current;
    const withQ = qs.size ? { ...p0, items: p0.items.map((i) => (qs.has(i.id) ? { ...i, q: qs.get(i.id) } : i)) } : p0;
    const plan = planSelection(withQ, target, per);
    update(plan.project);
    projectRef.current = plan.project;
    setTimeout(() => {
      if (!plan) return;
      setStep('photos');
      toast(
        plan.count >= plan.total
          ? `사진 ${plan.total}장을 모두 사용합니다 (1장당 약 ${plan.photoDuration.toFixed(1)}초)`
          : `${plan.total}장 중 ${plan.count}장을 골랐습니다 · 영상 ${fmtTime(target)}, 1장당 약 ${plan.photoDuration.toFixed(1)}초. 빠진 사진은 흐리게 표시됩니다.`,
        'ok',
        { label: '되돌리기', run: () => undo() },
      );
    }, 0);
  };
  autoSelectRef.current = autoSelect;

  // .memoria 파일 더블클릭으로 실행/전달된 경우 열기
  const openRef = useRef(null);
  useEffect(() => {
    if (!isDesktop || !api.pendingOpen) return;
    api.pendingOpen().then((p) => p && openRef.current(p));
    api.onOpenFile?.((p) => openRef.current(p));
  }, []);

  // ------------------------------------------------ 종료 전 저장 확인 · 가져오기 진행률
  const hasUnsaved = (project.items.length > 0 || project.music.tracks.length > 0) && (store.dirty || !store.filePath);
  useEffect(() => {
    if (isDesktop && api.setDirty) api.setDirty(hasUnsaved);
  }, [hasUnsaved]);
  const saveRef = useRef(null);
  saveRef.current = save;
  useEffect(() => {
    if (!isDesktop || !api.onSaveAndQuit) return;
    api.onSaveAndQuit(async () => {
      if (await saveRef.current(false)) api.quitNow();
    });
    const off = api.onScanProgress?.(({ done, total }) => setBusy((b) => (b && b.scan ? { ...b, done, total } : b)));
    return off;
  }, []);

  // ------------------------------------------------ 매직 버튼
  const magicRunning = useRef(false);
  const runMagic = async ({ intro, music, source }) => {
    if (magicRunning.current) return;
    magicRunning.current = true;
    try {
      await runMagicInner({ intro, music, source });
    } finally {
      magicRunning.current = false;
      setBusy(null);
    }
  };
  const runMagicInner = async ({ intro, music, source }) => {
    setShowMagic(false);
    previewRef.current?.pause?.();
    let newItems = null;
    const fresh = source === 'folder';
    if (fresh) {
      if (!isDesktop) return toast('PC 버전에서 폴더를 고를 수 있습니다', 'warn');
      const folder = await api.pickFolder();
      if (!folder) return;
      setBusy({ text: '사진을 불러오는 중…', done: 0, total: 0, scan: true });
      const r = await importPaths([folder], true);
      setBusy(null);
      if (!r.items.length) return toast('그 폴더에서 사진을 찾지 못했습니다', 'warn');
      newItems = r.items;
    }
    // 음악 준비 (받는 동안에도 화면을 잠가 편집이 사라지지 않게)
    let track = null;
    if (music.kind === 'keep') track = 'keep';
    else if (music.kind === 'file') {
      const paths = await api.pickAudio();
      if (!paths?.[0]) return toast('음악 파일을 고르지 않아 매직을 취소했습니다', 'info');
      setBusy({ text: '음악을 준비하는 중…', done: 0, total: 0, scan: true });
      try {
        track = { path: paths[0], name: baseName(paths[0]), duration: await audio.load(paths[0]) };
      } catch {
        setBusy(null);
        return toast('그 음악 파일을 읽을 수 없습니다', 'error');
      }
    } else if (music.kind === 'lib') {
      setBusy({ text: '음악을 준비하는 중…', done: 0, total: 0, scan: true });
      try {
        const t = music.track.local ? music.track : await api.musicDownload(music.track.id);
        const duration = await audio.load(t.path);
        track = { path: t.path, name: t.title, duration, libId: t.id, license: t.license, ...(t.needsCredit ? { needsCredit: true, credit: t.credit } : {}) };
      } catch {
        setBusy(null);
        return toast('음악을 받지 못했습니다. 인터넷 연결을 확인하거나 다른 곡을 골라 주세요.', 'error');
      }
    }
    setBusy(null);
    // 화질 분석 (좋은 사진 고르기·대표 사진에 사용)
    const pool = newItems || projectRef.current.items;
    const need = pool.filter((i) => i.type === 'photo' && typeof i.q !== 'number' && !i.skip);
    let qs = new Map();
    if (need.length) {
      busyCancel.current = false;
      setBusy({ text: '사진을 살펴보는 중… (화질·밝기)', done: 0, total: need.length });
      qs = await analyzePhotos(need, (d, t) => (d % 3 === 0 || d === t ? setBusy((b) => b && { ...b, done: d }) : null), () => busyCancel.current);
      setBusy(null);
      if (busyCancel.current) return toast('매직을 취소했습니다', 'info');
    }
    // 기다리는 동안 바뀐 내용이 있으면 최신 상태를 기준으로
    const items = (newItems || projectRef.current.items).map((i) => (qs.has(i.id) ? { ...i, q: qs.get(i.id) } : i));
    const r = magicProject({ ...projectRef.current, items }, { intro, track, fresh });
    const info = r.info;
    update(r.project);
    projectRef.current = r.project;
    setSelected(new Set());
    setStep('photos');
    setTimeout(() => {
      if (!info) return;
      toast(
        `✨ 완성! ${fmtTime(info.total)} 영상 · 사진 ${info.used}장${info.used < info.all ? ` (${info.all}장 중 고름)` : ''}${info.chapters ? ` · 챕터 ${info.chapters}개` : ''}. 마음에 들면 ‘영상 만들기’를 누르세요.`,
        'ok',
        { label: '되돌리기', run: () => undo() },
      );
      previewRef.current?.seek(0);
      previewRef.current?.play();
    }, 120);
  };

  // ------------------------------------------------ 새로 만들기
  const [askNew, setAskNew] = useState(false);
  const hasWork = project.items.length > 0 || project.music.tracks.length > 0;
  const unsaved = hasWork && (store.dirty || !store.filePath);
  const startNew = () => {
    previewRef.current?.pause?.();
    store.replace(defaultProject());
    setSelected(new Set());
    setActiveKey(null);
    setAskNew(false);
    setStep('photos');
    setShowTemplates(true);
    setTimeout(() => previewRef.current?.seek(0), 50);
    toast('새 프로젝트를 시작했습니다');
  };
  const requestNew = () => (unsaved ? setAskNew(true) : startNew());
  // askNew: true = 새로 만들기, { open: 경로|null } = 다른 프로젝트 열기
  const proceedAsk = () => {
    const a = askNew;
    setAskNew(false);
    if (a && typeof a === 'object') open(a.open || undefined);
    else startNew();
  };
  const saveThenNew = async () => {
    if (await save(false)) proceedAsk();
  };
  const requestOpen = (given) => {
    const g = typeof given === 'string' ? given : null;
    if (unsaved) setAskNew({ open: g });
    else open(g || undefined);
  };
  const open = async (given) => {
    if (!isDesktop) return;
    const r = await api.openProject(typeof given === 'string' ? given : undefined);
    if (!r) return;
    if (r.error) return toast(r.error, 'error');
    if (r.fromBackup) toast('프로젝트 파일이 손상되어 직전 저장본(.bak)으로 열었습니다', 'warn');
    setShowTemplates(false);
    try {
      const data = JSON.parse(r.json);
      let p = normalizeProject(data.project || data);
      p = await relinkLibraryMusic(p);
      store.replace(p, r.path);
      setSelected(new Set());
      toast(`‘${p.name}’ 프로젝트를 열었습니다`);
      checkMissing(p);
      for (const t of p.music.tracks) audio.load(t.path).catch(() => {});
    } catch {
      toast('프로젝트 파일을 읽을 수 없습니다', 'error');
    }
  };

  /** 다른 PC·설치 위치에서 연 프로젝트: 무료 음악 라이브러리 곡의 경로를 이 PC 기준으로 다시 연결 */
  const relinkLibraryMusic = async (p) => {
    const lib = p.music.tracks.filter((t) => t.libId);
    if (!lib.length || !api?.musicLibrary) return p;
    try {
      const ex = await api.exists(lib.map((t) => t.path));
      if (ex.every(Boolean)) return p;
      const { tracks } = await api.musicLibrary();
      const byId = new Map(tracks.filter((t) => t.local).map((t) => [t.id, t.path]));
      return { ...p, music: { ...p.music, tracks: p.music.tracks.map((t) => (t.libId && byId.has(t.libId) ? { ...t, path: byId.get(t.libId) } : t)) } };
    } catch {
      return p;
    }
  };

  openRef.current = requestOpen;

  // ------------------------------------------------ 선택 / 탐색
  const seekToKey = useCallback((key) => {
    const t = tlRef.current;
    const s = t.segments.find((x) => x.key === key) || t.byItem?.get(key);
    if (!s) return;
    if (s.type === 'group' && s.key !== key) {
      // 몽타주 안의 사진: 그 사진이 화면에 다 들어온 뒤 시점으로
      const k = Math.max(0, s.items.findIndex((i) => i.id === key));
      const body = s.dur - s.tIn - s.tOut;
      previewRef.current?.seek(s.start + s.tIn + body * Math.min(0.85, 0.2 + (0.6 * (k + 1)) / s.items.length));
    } else previewRef.current?.seek(s.start + Math.min(s.tIn + 0.4, s.dur * 0.5));
  }, []);

  const onSelect = useCallback(
    (id, e) => {
      setSelected((prev) => {
        const items = project.items;
        if (e?.shiftKey && lastSel.current) {
          const a = items.findIndex((i) => i.id === lastSel.current);
          const b = items.findIndex((i) => i.id === id);
          if (a >= 0 && b >= 0) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            return new Set(items.slice(lo, hi + 1).map((i) => i.id));
          }
        }
        if (e?.ctrlKey || e?.metaKey) {
          const n = new Set(prev);
          n.has(id) ? n.delete(id) : n.add(id);
          lastSel.current = id;
          return n;
        }
        lastSel.current = id;
        return new Set([id]);
      });
      if (!e?.shiftKey && !e?.ctrlKey && !e?.metaKey) seekToKey(id);
    },
    [project.items, seekToKey],
  );

  const onSelectSpecial = (key) => {
    setSelected(new Set([key]));
    seekToKey(key);
  };

  const onSelectIds = (ids) => {
    setSelected(new Set(ids));
    setStep('photos');
    if (ids[0]) seekToKey(ids[0]);
  };

  const onReorder = (id, toIdx) => {
    update((p) => {
      const items = p.items.slice();
      const moving = selected.has(id) && selected.size > 1 ? items.filter((i) => selected.has(i.id)) : [items.find((i) => i.id === id)];
      const ids = new Set(moving.map((m) => m.id));
      const before = items.slice(0, toIdx).filter((i) => !ids.has(i.id));
      const after = items.slice(toIdx).filter((i) => !ids.has(i.id));
      return { ...p, items: [...before, ...moving, ...after] };
    });
  };

  const onSetTransition = (id, t) => {
    if (id === '__intro') update((p) => setPath(p, 'intro.transition', t));
    else update((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, transition: t } : i)) }));
    setPreviewReq({ key: id === '__intro' ? 'intro' : id, n: Math.random() });
  };

  const onSetAllTransitions = (t) => {
    update((p) => ({ ...p, intro: { ...p.intro, transition: t }, items: p.items.map((i) => ({ ...i, transition: t })) }));
    toast('모든 장면 전환에 적용했습니다');
  };

  // 전환을 고르면 그 구간을 바로 재생해서 보여줌
  useEffect(() => {
    if (!previewReq) return;
    const segs = tl.segments;
    const i = segs.findIndex((s) => s.key === previewReq.key);
    const nx = segs[i + 1];
    setPreviewReq(null);
    if (nx) previewRef.current?.playRange(nx.start - 0.9, nx.start + nx.tIn + 0.7);
  }, [tl, previewReq]);

  const onApplyTemplate = (id) => {
    update((p) => applyTemplate(p, id));
    setShowTemplates(false);
    toast(`‘${TEMPLATES[id].name}’ 템플릿을 적용했습니다. 문구는 ‘문구’ 단계에서 바꿀 수 있습니다.`);
    setStep(project.items.length ? 'text' : 'photos');
    setTimeout(() => {
      previewRef.current?.seek(0);
      previewRef.current?.play();
    }, 300);
  };

  const onTick = useCallback((t) => {
    const a = activeAt(tlRef.current, t);
    const key = a ? (a.to && a.p > 0.5 ? a.to.key : a.from.key) : null;
    setActiveKey((k) => (k === key ? k : key));
  }, []);

  // ------------------------------------------------ 단축키
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      // Ctrl+S는 글자를 입력하는 중에도 저장 (가장 흔히 누르는 순간)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !exportJob && !busy) {
        e.preventDefault();
        save(e.shiftKey);
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || exportJob || showTemplates || askNew || busy || showMagic || showHelp) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') {
        e.preventDefault();
        previewRef.current?.toggle();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save(e.shiftKey);
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        requestNew();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(project.items.map((i) => i.id)));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        actions.deleteSelected();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const keys = tl.segments.map((s) => s.key);
        const one = selected.size === 1 ? [...selected][0] : null;
        const cur = one ? tl.byItem?.get(one)?.key || one : activeKey;
        let i = keys.indexOf(cur);
        i = Math.max(0, Math.min(keys.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
        const k = keys[i];
        if (!k) return;
        const g = tl.segments[i].type === 'group' ? tl.segments[i] : null;
        setSelected(new Set(g ? g.items.map((x) => x.id) : [k]));
        lastSel.current = g ? g.items[0].id : k;
        seekToKey(k);
      } else if (e.key === 'Escape') setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // 창 전체 드래그&드롭
  useEffect(() => {
    const over = (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const leave = (e) => {
      if (!e.relatedTarget) setDragOver(false);
    };
    const drop = (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer?.files?.length) onDropFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [onDropFiles]);

  const panelProps = { project, update, tl, actions, toast, onSelectIds };
  const empty = project.items.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-name">MEMORIA</span>
          <span className="brand-sub">기념영상 스튜디오</span>
        </div>
        <input
          className="project-name"
          value={project.name}
          onChange={(e) => update((p) => ({ ...p, name: e.target.value }), 'name')}
          onKeyDown={keepSave}
          spellCheck={false}
          title="프로젝트 이름"
        />
        {store.dirty && store.filePath && <span className="dirty-dot" title="저장하지 않은 변경 사항" />}
        <div className="top-actions">
          <Button icon="undo" onClick={undo} disabled={!store.past.length} title="실행 취소 (Ctrl+Z)" />
          <Button icon="redo" onClick={redo} disabled={!store.future.length} title="다시 실행 (Ctrl+Shift+Z)" />
          <span className="sep" />
          <Button icon="sparkle" variant="magic" onClick={() => setShowMagic(true)} title="인트로·음악·사진만 고르면 나머지는 자동으로">
            매직
          </Button>
          <Button icon="sparkle" onClick={() => setShowTemplates(true)} title="영상 종류(템플릿) 고르기">
            템플릿
          </Button>
          <Button icon="plus" onClick={requestNew} title="지금 작업을 닫고 새 영상 만들기 (Ctrl+N)">
            새로 만들기
          </Button>
          <Button icon="open" onClick={requestOpen} title="프로젝트 열기">
            열기
          </Button>
          <Button icon="save" onClick={() => save(false)} title="프로젝트 저장 (Ctrl+S)">
            저장
          </Button>
          <Button icon="info" onClick={() => setShowHelp(true)} title="도움말 · 문제 해결 · 라이선스" />
          <Button icon="export" variant="primary" onClick={() => setStep('export')}>
            영상 만들기
          </Button>
        </div>
      </header>

      <nav className="stepnav">
        {STEPS.map(([id, label, icon]) => (
          <button key={id} className={'step' + (step === id ? ' on' : '')} onClick={() => setStep(id)}>
            <span className="step-icon">
              <Icon name={icon} size={20} />
            </span>
            <span className="step-label">{label}</span>
          </button>
        ))}
      </nav>

      <aside className="panel">
        <div className="panel-scroll">
          {step === 'photos' && <PhotosPanel {...panelProps} />}
          {step === 'text' && <TextPanel {...panelProps} />}
          {step === 'style' && <StylePanel {...panelProps} />}
          {step === 'music' && <MusicPanel {...panelProps} />}
          {step === 'export' && <ExportPanel {...panelProps} />}
        </div>
        <StepFooter step={step} setStep={setStep} hasPhotos={project.items.length > 0} />
      </aside>

      <main className="center">
        <Preview
          ref={previewRef}
          project={project}
          tl={tl}
          quality={quality}
          audio={audio}
          onTick={onTick}
          sceneLabel={sceneLabel(tl, activeKey, project)}
          onError={(m) => toast(m, 'error')}
        />
        <div className="preview-opts">
          <span>미리보기 화질</span>
          <button className={quality === 'standard' ? 'on' : ''} onClick={() => setQuality('standard')}>
            가볍게
          </button>
          <button className={quality === 'high' ? 'on' : ''} onClick={() => setQuality('high')}>
            선명하게
          </button>
        </div>
        {empty && (
          <div className="empty-hero">
            <div className="empty-card">
              <div className="empty-mark">◆</div>
              <h2>사진 폴더를 선택해 시작하세요</h2>
              <p>
                사진을 촬영일 순서로 불러와 자연스러운 전환과 움직임,
                <br />
                인트로·엔딩이 있는 영상을 만들어 PC에 MP4 파일로 저장합니다.
              </p>
              <div className="btn-row center">
                <Button icon="folder" variant="primary" size="lg" onClick={() => actions.importFolder(true)}>
                  사진 폴더 선택
                </Button>
                <Button icon="image" variant="soft" size="lg" onClick={actions.importFiles}>
                  사진 파일 선택
                </Button>
              </div>
              <Button icon="sparkle" variant="magic" size="lg" onClick={() => setShowMagic(true)}>
                매직으로 한 번에 만들기
              </Button>
              <button className="link" onClick={() => setShowTemplates(true)}>
                ✦ 영상 종류(웨딩·생일·여행·행사 등) 먼저 고르기
              </button>
              <small>또는 사진·폴더를 이 창에 끌어다 놓으세요 · JPG, PNG, WEBP 지원</small>
            </div>
          </div>
        )}
      </main>

      <aside className="inspector-col">
        <Inspector project={project} update={update} tl={tl} selected={selected} actions={actions} onSelectIds={onSelectIds} />
      </aside>

      <footer className="strip-area">
        <div className="strip-bar">
          <span>
            장면 <b>{tl.segments.length}</b> · 전체 <b>{Math.floor(Math.round(tl.total) / 60)}분 {Math.round(tl.total) % 60}초</b>
          </span>
          <span className="strip-hint">드래그로 순서 변경 · ◆ 를 눌러 전환 효과 선택 · Shift/Ctrl 다중 선택</span>
          <div className="strip-actions">
            <Segmented value={compact ? 'small' : 'large'} onChange={(v) => setCompact(v === 'small')} size="sm" options={[['large', '크게'], ['small', '작게']]} />
            <Button icon="chapter" size="sm" onClick={() => actions.addChapter()}>
              챕터 추가
            </Button>
            <Button icon="trash" size="sm" disabled={!selected.size} onClick={actions.deleteSelected}>
              삭제
            </Button>
          </div>
        </div>
        <Filmstrip
          compact={compact}
          project={project}
          tl={tl}
          selected={selected}
          activeKey={activeKey}
          onSelect={onSelect}
          onSelectSpecial={onSelectSpecial}
          onReorder={onReorder}
          onSetTransition={onSetTransition}
          onSetAllTransitions={onSetAllTransitions}
          onDropFiles={onDropFiles}
          onAddPhotos={actions.importFiles}
        />
      </footer>

      {dragOver && (
        <div className="drop-overlay">
          <div>
            <Icon name="photo" size={40} />
            <b>여기에 놓아 사진·음악 추가</b>
          </div>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.level}>
            <Icon name={t.level === 'ok' ? 'check' : t.level === 'info' ? 'info' : 'warn'} size={16} />
            <span>{t.text}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showMagic && <MagicModal project={project} onClose={() => setShowMagic(false)} onRun={runMagic} />}
      {busy && (
        <div className="modal-back">
          <div className="modal busy-modal" role="dialog" aria-modal="true">
            <div className="modal-title">
              <span className="spinner" /> {busy.text}
            </div>
            {busy.total > 0 && (
              <>
                <div className="busy-bar">
                  <i style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} />
                </div>
                <p className="hint small">{busy.scan ? `${busy.done} / ${busy.total}개 파일 확인` : `${busy.done} / ${busy.total}장 · 한 번 분석한 사진은 다시 분석하지 않습니다.`}</p>
              </>
            )}
            {!busy.scan && (
              <div className="modal-actions">
                <Button onClick={() => (busyCancel.current = true)}>취소</Button>
              </div>
            )}
          </div>
        </div>
      )}
      {askNew && (
        <div className="modal-back" onMouseDown={() => setAskNew(false)}>
          <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-title">
              <Icon name="warn" size={20} /> 지금 작업을 저장할까요?
            </div>
            <p className="hint">
              ‘{project.name}’에 저장하지 않은 변경 사항이 있습니다. {typeof askNew === 'object' ? '다른 프로젝트를 열면 지금 작업이 닫힙니다.' : '새로 만들면 지금 화면의 사진·문구·음악 설정이 모두 비워집니다.'}
              {!isDesktop && ' (웹 미리보기 버전은 저장할 수 없습니다)'}
            </p>
            <div className="modal-actions">
              <Button onClick={() => setAskNew(false)}>취소</Button>
              <Button variant="danger" onClick={proceedAsk}>
                저장 안 함
              </Button>
              {isDesktop && (
                <Button icon="save" variant="primary" onClick={saveThenNew}>
                  {typeof askNew === 'object' ? '저장하고 열기' : '저장하고 새로 만들기'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {showTemplates && <TemplateGallery project={project} onApply={onApplyTemplate} onClose={() => setShowTemplates(false)} />}
      {exportJob && <ExportModal project={project} outPath={exportJob.path} draft={exportJob.draft} onClose={() => setExportJob(null)} />}

      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addItems(importWebFiles(e.target.files)); e.target.value = ''; }} />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={async (e) => {
          for (const f of e.target.files) await addTrack(URL.createObjectURL(f), f.name);
          e.target.value = '';
        }}
      />
    </div>
  );
}

void photoMeta;
