// UI 비즈니스 로직: 사진 가져오기, 정렬, 자동 챕터, 점검 체크리스트
import { api, isDesktop, baseName } from '../platform.js';
import { newId, RESOLUTIONS, outputSize } from '../engine/presets.js';
import { photoMeta } from './store.js';
import { fmtTime } from '../engine/math.js';

export const LOW_RES_PX = 1500; // 장변 기준 이 미만이면 대형 스크린에서 흐려 보임

/** 원본 해상도: 가져올 때 읽은 값 우선, 없으면 썸네일 생성 시 기록된 값 */
export function photoDims(item) {
  if (item.w && item.h) return { w: item.w, h: item.h };
  const m = photoMeta.get(item.path);
  return m && m.w ? { w: m.w, h: m.h } : null;
}

export function isLowRes(item) {
  const d = photoDims(item);
  return !!d && Math.max(d.w, d.h) < LOW_RES_PX;
}

/** 경로 목록(파일/폴더) → 사진 아이템 */
export async function importPaths(paths, recursive = true) {
  if (!isDesktop) return { items: [], skipped: [] };
  const { photos, skipped } = await api.scanPaths(paths, recursive);
  return { items: photos.map(photoItemFromScan), skipped };
}

function photoItemFromScan(p) {
  return { id: newId('p'), type: 'photo', path: p.path, name: p.name, date: p.date, dateSource: p.dateSource, w: p.w || 0, h: p.h || 0, caption: '', label: '' };
}

/** 웹(테스트) 모드: File 객체 → blob URL 아이템 */
export function importWebFiles(files) {
  const items = [];
  const skipped = [];
  for (const f of files) {
    if (/\.(heic|heif|tiff?)$/i.test(f.name)) {
      skipped.push({ path: f.name, reason: 'HEIC' });
      continue;
    }
    if (!f.type.startsWith('image/')) continue;
    const rel = (f.webkitRelativePath || '').split('/');
    items.push({ id: newId('p'), type: 'photo', path: URL.createObjectURL(f), name: f.name, folder: rel.length > 1 ? rel[rel.length - 2] : '', date: f.lastModified, dateSource: 'file', caption: '', label: '' });
  }
  return { items, skipped };
}

export function mergeItems(project, newItems, insertAfterId = null) {
  const existing = new Set(project.items.filter((i) => i.type === 'photo').map((i) => i.path));
  const fresh = newItems.filter((i) => !existing.has(i.path));
  const items = project.items.slice();
  let idx = insertAfterId ? items.findIndex((i) => i.id === insertAfterId) + 1 : items.length;
  if (idx <= 0) idx = items.length;
  items.splice(idx, 0, ...fresh);
  return { project: { ...project, items }, added: fresh.length, dup: newItems.length - fresh.length };
}

/** 정렬: 챕터 카드 사이의 구간별로 정렬해 챕터 구조를 유지 */
export function sortPhotos(project, by, reverse = false) {
  const cmp = (a, b) => {
    let r = 0;
    if (by === 'date') r = (a.date || 0) - (b.date || 0) || (a.name || '').localeCompare(b.name || '', 'ko', { numeric: true });
    else r = (a.name || baseName(a.path)).localeCompare(b.name || baseName(b.path), 'ko', { numeric: true });
    return reverse ? -r : r;
  };
  const out = [];
  let bucket = [];
  const flush = () => {
    out.push(...bucket.sort(cmp));
    bucket = [];
  };
  for (const it of project.items) {
    if (it.type === 'photo') bucket.push(it);
    else {
      flush();
      out.push(it);
    }
  }
  flush();
  return { ...project, items: out };
}

/** 사진 순서 무작위 (챕터 구간 유지) */
export function shufflePhotos(project) {
  const out = [];
  let bucket = [];
  const flush = () => {
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
    out.push(...bucket);
    bucket = [];
  };
  for (const it of project.items) {
    if (it.type === 'photo') bucket.push(it);
    else {
      flush();
      out.push(it);
    }
  }
  flush();
  return { ...project, items: out };
}

export function yearOf(it) {
  if (!it.date) return null;
  return new Date(it.date).getFullYear();
}

/** 연도를 믿을 수 있는 사진: EXIF 촬영일 또는 파일·폴더 이름에 적힌 날짜/연도 */
export const hasKnownYear = (it) => it.type === 'photo' && (it.dateSource === 'exif' || it.dateSource === 'name' || it.dateSource === 'folder');

/** 촬영 연도가 바뀌는 지점마다 챕터 카드 자동 생성 (기존 자동 챕터는 교체) */
export function autoChapters(project) {
  const items = project.items.filter((i) => !(i.type === 'chapter' && i.auto));
  const out = [];
  let lastYear = null;
  for (const it of items) {
    if (hasKnownYear(it)) {
      const y = yearOf(it);
      if (y && y !== lastYear) {
        out.push({ id: newId('c'), type: 'chapter', title: String(y), subtitle: '', auto: true });
        lastYear = y;
      }
    }
    out.push(it);
  }
  return { ...project, items: out };
}

export function autoYearLabels(project, overwrite = false) {
  let n = 0;
  const items = project.items.map((it) => {
    if (!hasKnownYear(it)) return it;
    if (it.label && !overwrite) return it;
    n++;
    return { ...it, label: String(yearOf(it)) };
  });
  return { project: { ...project, items }, count: n };
}

export function musicLength(music) {
  const tr = (music.tracks || []).filter((t) => t.duration > 0);
  if (!tr.length) return 0;
  const xf = Number(music.crossfade) || 0;
  return tr.reduce((s, t, i) => s + t.duration - (i > 0 ? Math.min(xf, t.duration / 2) : 0), 0);
}

/** 내보내기 전 점검 */
export function checklist(project, tl) {
  const out = [];
  const photos = project.items.filter((i) => i.type === 'photo');
  if (!photos.length) out.push({ level: 'error', text: '사진이 없습니다. 사진 폴더를 먼저 불러오세요.' });
  const missing = photos.filter((p) => photoMeta.get(p.path)?.missing);
  if (missing.length) out.push({ level: 'error', text: `찾을 수 없는 사진 ${missing.length}장 (파일이 이동/삭제됨)`, ids: missing.map((m) => m.id) });
  const broken = photos.filter((p) => photoMeta.get(p.path)?.error);
  if (broken.length) out.push({ level: 'error', text: `열 수 없는 사진 ${broken.length}장`, ids: broken.map((m) => m.id) });
  const low = photos.filter((p) => isLowRes(p));
  if (low.length) out.push({ level: 'warn', text: `저해상도 사진 ${low.length}장 — 대형 스크린에서 흐릿할 수 있습니다`, ids: low.map((m) => m.id) });
  const ml = musicLength(project.music);
  if (!project.music.tracks.length) out.push({ level: 'info', text: '배경음악이 없습니다. 무음 영상으로 만들어집니다.' });
  else if (!project.music.loop && ml + 0.5 < tl.total) out.push({ level: 'warn', text: `음악(${fmtTime(ml)})이 영상(${fmtTime(tl.total)})보다 짧습니다. 끝부분이 무음이 됩니다.` });
  else if (ml > tl.total + 20) out.push({ level: 'info', text: `음악이 ${fmtTime(ml - tl.total)} 더 깁니다. 영상 끝에서 자연스럽게 페이드아웃됩니다.` });
  if (tl.fitShort) out.push({ level: 'warn', text: `사진이 많아 정한 길이(${fmtTime(tl.target)})보다 ${fmtTime(tl.total)}로 길어집니다.` });
  else if ((tl.photoDuration || project.style.photoDuration) < 1.5 && photos.length) out.push({ level: 'warn', text: '사진이 1.5초보다 빨리 넘어갑니다. 감상용이라면 전체 길이를 늘리는 것을 권장합니다.' });
  if (project.intro.enabled && !project.text.title.trim() && !project.text.number.trim()) out.push({ level: 'warn', text: '인트로 제목이 비어 있습니다.' });
  if (tl.total > 20 * 60) out.push({ level: 'info', text: '영상이 20분이 넘습니다. 행사용으로는 5~10분을 권장합니다.' });
  if (!out.some((o) => o.level !== 'info') && photos.length) out.unshift({ level: 'ok', text: '내보낼 준비가 되었습니다.' });
  return out;
}

export function estimateSizeMB(project, total) {
  const r = RESOLUTIONS[project.output.resolution] || RESOLUTIONS['1080p'];
  const { w, h } = outputSize(project);
  const area = (w * h) / ((r.s * 16) / 9 * r.s);
  const qMul = { standard: 0.6, high: 1, best: 1.6 }[project.output.quality] || 1;
  const fpsMul = project.output.fps >= 50 ? 1.4 : 1;
  const grainMul = 1 + (Number(project.style.grain) || 0) * 0.8;
  const mbps = r.bitrate * area * qMul * fpsMul * grainMul * 0.55 + (project.music.tracks.length ? 0.256 : 0);
  return (mbps * total) / 8;
}

export function defaultVideoName(project) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const safe = (project.name || '기념영상').replace(/[\\/:*?"<>|]/g, '').trim() || '기념영상';
  return `${safe}_${ymd}.mp4`;
}
