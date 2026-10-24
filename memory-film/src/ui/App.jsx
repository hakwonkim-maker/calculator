// MEMORIA 기념영상 스튜디오 — 메인 화면
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore, setPath, photoMeta, setPhotoMeta } from './store.js';
import { buildTimeline, activeAt } from '../engine/timeline.js';
import { AudioPreview } from '../engine/audio.js';
import { newId, normalizeProject, defaultProject, applyTemplate, TEMPLATES } from '../engine/presets.js';
import { importPaths, importWebFiles, mergeItems, defaultVideoName } from './logic.js';
import { api, isDesktop, baseName } from '../platform.js';
import { Preview } from './Preview.jsx';
import { Filmstrip } from './Filmstrip.jsx';
import { Inspector } from './Inspector.jsx';
import { ExportModal } from './ExportModal.jsx';
import { PhotosPanel, TextPanel, StylePanel, MusicPanel, ExportPanel, TemplateGallery } from './panels.jsx';
import { Icon, Button } from './controls.jsx';

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
  const [exportPath, setExportPath] = useState(null);
  const [quality, setQuality] = useState('standard');
  const [dragOver, setDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(() => !store.restored && !store.project.items.length && !store.project.template);
  const [previewReq, setPreviewReq] = useState(null);
  const previewRef = useRef(null);
  const audio = useMemo(() => new AudioPreview(), []);
  const fileInput = useRef(null);
  const audioInput = useRef(null);
  const lastSel = useRef(null);
  const tlRef = useRef(tl);
  tlRef.current = tl;

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
      let added = 0;
      let dup = 0;
      update((p) => {
        let afterId = null;
        if (atIndex != null && atIndex > 0) afterId = p.items[atIndex - 1]?.id;
        const r = mergeItems(p, items, afterId);
        if (atIndex === 0) {
          const fresh = r.project.items.slice(p.items.length);
          r.project.items = [...fresh, ...p.items];
        }
        added = r.added;
        dup = r.dup;
        return r.project;
      });
      setTimeout(() => {
        let msg = `사진 ${added}장을 추가했습니다`;
        if (dup) msg += ` · 중복 ${dup}장 제외`;
        if (skipped.length) {
          const heic = skipped.filter((s) => s.reason === 'HEIC' || s.reason === 'HEIF').length;
          msg += ` · 지원하지 않는 형식 ${skipped.length}장 제외`;
          if (heic) msg += ' (아이폰 HEIC는 JPG로 변환 후 추가해 주세요)';
        }
        toast(msg, skipped.length ? 'warn' : 'ok');
      }, 0);
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
        busyToast();
        addItems(await importPaths([folder], recursive));
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
      startExport: async () => {
        // 매번 저장 위치를 확인 (이전 영상을 실수로 덮어쓰지 않도록)
        const out = await api.saveVideoDialog(project.output.path ? baseName(project.output.path) : defaultVideoName(project));
        if (!out) return;
        update((p) => setPath(p, 'output.path', out));
        previewRef.current?.pause();
        setExportPath(out);
      },
    }),
    [addItems, project, selected, toast, undo, update],
  );

  const addTrack = async (path, name) => {
    try {
      const duration = await audio.load(path);
      update((p) => setPath(p, 'music.tracks', [...p.music.tracks, { path, name, duration }]));
      toast(`‘${name}’ 추가 (${Math.floor(duration / 60)}분 ${Math.round(duration % 60)}초)`);
    } catch {
      toast(`‘${name}’ 파일을 읽을 수 없습니다`, 'error');
    }
  };

  const onDropFiles = useCallback(
    async (files, atIndex = null) => {
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
    if (miss) toast(`원본 사진 ${miss}장을 찾을 수 없습니다 (이동 또는 삭제됨)`, 'error');
  };

  const save = async (as = false) => {
    if (!isDesktop) return toast('PC 버전에서 저장할 수 있습니다', 'warn');
    const json = JSON.stringify({ app: 'MEMORIA', savedAt: new Date().toISOString(), project }, null, 1);
    const p = await api.saveProject(json, as ? null : store.filePath, project.name);
    if (p) {
      store.markSaved(p);
      toast('프로젝트를 저장했습니다');
    }
  };
  const open = async () => {
    if (!isDesktop) return;
    const r = await api.openProject();
    if (!r) return;
    try {
      const data = JSON.parse(r.json);
      const p = normalizeProject(data.project || data);
      store.replace(p, r.path);
      setSelected(new Set());
      toast(`‘${p.name}’ 프로젝트를 열었습니다`);
      checkMissing(p);
      for (const t of p.music.tracks) audio.load(t.path).catch(() => {});
    } catch {
      toast('프로젝트 파일을 읽을 수 없습니다', 'error');
    }
  };

  // ------------------------------------------------ 선택 / 탐색
  const seekToKey = useCallback((key) => {
    const s = tlRef.current.segments.find((x) => x.key === key);
    if (s) previewRef.current?.seek(s.start + Math.min(s.tIn + 0.4, s.dur * 0.5));
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
    setStep('text');
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
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || exportPath || showTemplates) return;
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
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(project.items.map((i) => i.id)));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        actions.deleteSelected();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const keys = tl.segments.map((s) => s.key);
        const cur = selected.size === 1 ? [...selected][0] : activeKey;
        let i = keys.indexOf(cur);
        i = Math.max(0, Math.min(keys.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
        const k = keys[i];
        if (!k) return;
        setSelected(new Set([k]));
        lastSel.current = k;
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
          onKeyDown={(e) => e.stopPropagation()}
          spellCheck={false}
          title="프로젝트 이름"
        />
        {store.dirty && store.filePath && <span className="dirty-dot" title="저장하지 않은 변경 사항" />}
        <div className="top-actions">
          <Button icon="undo" onClick={undo} disabled={!store.past.length} title="실행 취소 (Ctrl+Z)" />
          <Button icon="redo" onClick={redo} disabled={!store.future.length} title="다시 실행 (Ctrl+Shift+Z)" />
          <span className="sep" />
          <Button icon="sparkle" onClick={() => setShowTemplates(true)} title="영상 종류(템플릿) 고르기">
            템플릿
          </Button>
          <Button icon="open" onClick={open} title="프로젝트 열기">
            열기
          </Button>
          <Button icon="save" onClick={() => save(false)} title="프로젝트 저장 (Ctrl+S)">
            저장
          </Button>
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
      </aside>

      <main className="center">
        <Preview
          ref={previewRef}
          project={project}
          tl={tl}
          quality={quality}
          audio={audio}
          onTick={onTick}
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
            장면 <b>{tl.segments.length}</b> · 전체 <b>{Math.floor(tl.total / 60)}분 {Math.round(tl.total % 60)}초</b>
          </span>
          <span className="strip-hint">드래그로 순서 변경 · ◆ 를 눌러 전환 효과 선택 · Shift/Ctrl 다중 선택</span>
          <div className="strip-actions">
            <Button icon="chapter" size="sm" onClick={() => actions.addChapter()}>
              챕터 추가
            </Button>
            <Button icon="trash" size="sm" disabled={!selected.size} onClick={actions.deleteSelected}>
              삭제
            </Button>
          </div>
        </div>
        <Filmstrip
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

      {showTemplates && <TemplateGallery project={project} onApply={onApplyTemplate} onClose={() => setShowTemplates(false)} />}
      {exportPath && <ExportModal project={project} outPath={exportPath} onClose={() => setExportPath(null)} />}

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
