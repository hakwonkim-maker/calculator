// 매직 버튼: 인트로·음악·사진만 정하면 나머지 연출을 자동으로 구성
// - fresh(새 폴더): 촬영일순 정렬, 연도 챕터, 폴더명 표시, 대표 사진, 길이·선별 모두 자동
// - 기존 프로젝트: 사용자가 손본 것(순서·자막·★·뺀 사진·문구·몽타주 수정)은 유지하고 연출만 새로
import { buildTimeline, folderOf } from './timeline.js';
import { planSelection, photoScore } from './select.js';
import { newId } from './presets.js';

const KNOWN = new Set(['exif', 'name', 'folder']);
const yearOf = (it) => (it.date && KNOWN.has(it.dateSource) ? new Date(it.date).getFullYear() : null);

/**
 * 사진 수·음악 길이로 목표 길이 결정 (초)
 * - 사진 기준 길이(want): 1장당 약 3초, 최대 3분 (사진이 더 많으면 좋은 사진만 고름)
 * - 음악 길이가 사진에 어울리면(want의 75% 이상, 사진으로 채울 수 있는 길이 이하) 음악에 맞춰 곡과 함께 끝나게
 * - 곡이 너무 짧으면(예: 1분 곡에 사진 178장) 사진 기준 길이로 만들고 음악은 반복
 */
export function magicLength(nPhotos, musicLen) {
  const natural = nPhotos * 3.2 + 22; // 1장당 약 3초 + 인트로·엔딩
  const want = Math.max(30, Math.round(Math.min(natural, 180)));
  let target = want;
  if (musicLen >= 45 && musicLen >= want * 0.75 && musicLen <= natural * 1.33) target = Math.round(Math.min(musicLen, 360));
  return { target, select: natural > target * 1.08 };
}

/**
 * base: 현재 프로젝트 · opts: { intro, track(음악 트랙 객체 | null | 'keep'), fresh, seed }
 * 반환: { project, info: { target, used, total, chapters } }
 */
export function magicProject(base, { intro, track, fresh, seed }) {
  let items = base.items.slice();
  const photos0 = items.filter((i) => i.type === 'photo');

  if (fresh) {
    // 촬영일순 + 연도가 바뀌는 곳에 챕터 (연도를 아는 사진이 많고 3개 연도 이상일 때)
    items = photos0.slice().sort((a, b) => (a.date || 0) - (b.date || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true }));
    const years = new Set(items.map(yearOf).filter(Boolean));
    const known = items.filter(yearOf).length;
    if (years.size >= 3 && known >= items.length * 0.6 && items.length >= 15) {
      const out = [];
      let last = null;
      for (const it of items) {
        const y = yearOf(it);
        if (y && y !== last) {
          out.push({ id: newId('c'), type: 'chapter', title: String(y), subtitle: '', auto: true });
          last = y;
        }
        out.push(it);
      }
      items = out;
    }
  }
  // 연출을 새로 짜므로(새 배치) 이전 배치에 붙어 있던 몽타주 효과 지정은 지움 (다른 사진 묶음에 잘못 적용되지 않게)
  items = items.map((i) => (i.montage ? { ...i, montage: undefined } : i));
  const used = items.filter((i) => i.type === 'photo' && !i.skip);
  // 대표 사진이 하나도 없으면 화질 좋은 사진 5장을 인트로·엔딩용으로 지정 (고르게)
  if (!used.some((i) => i.star) && used.length >= 8) {
    const ranked = used.map((it, k) => ({ it, k, s: photoScore(it) }));
    const picks = new Set();
    const bins = 5;
    for (let b = 0; b < bins; b++) {
      const seg = ranked.filter((r) => Math.floor((r.k * bins) / used.length) === b);
      seg.sort((a, c) => c.s - a.s);
      if (seg[0]) picks.add(seg[0].it.id);
    }
    items = items.map((i) => (picks.has(i.id) ? { ...i, star: true } : i));
  }

  const folders = new Set(used.map((i) => folderOf(i)).filter(Boolean));
  const style = {
    ...base.style,
    seed: seed ?? Math.floor(Math.random() * 1e6),
    montage: base.style.montage === 'off' || base.style.montage === 'few' ? 'normal' : base.style.montage || 'normal',
    motion: base.style.motion === 'none' || base.style.motion === 'subtle' ? 'normal' : base.style.motion || 'normal',
    beatSync: true,
    enhance: base.style.enhance === 'off' ? 'off' : base.style.enhance || 'old',
    folderLabel: base.style.folderLabel && base.style.folderLabel !== 'off' ? base.style.folderLabel : folders.size >= 2 ? 'change' : 'off',
  };
  const music =
    track === 'keep'
      ? base.music
      : { ...base.music, tracks: track ? [track] : [], loop: true, fadeOut: Math.max(4, base.music.fadeOut || 5) };
  const musicLen = music.tracks.reduce((s, t) => s + (t.duration || 0), 0);
  let project = {
    ...base,
    items,
    music,
    style,
    intro: { ...base.intro, enabled: true, style: intro || base.intro.style },
    outro: { ...base.outro, enabled: true },
  };
  const { target, select } = magicLength(used.length, musicLen);
  project = { ...project, style: { ...project.style, lengthMode: 'total', targetDuration: target } };
  if (select) project = planSelection(project, target, 3, { keepExcluded: !fresh }).project;
  const tl = buildTimeline(project);
  return {
    project,
    info: {
      target,
      total: tl.total,
      used: project.items.filter((i) => i.type === 'photo' && !i.skip).length,
      all: project.items.filter((i) => i.type === 'photo').length,
      chapters: project.items.filter((i) => i.type === 'chapter').length,
    },
  };
}
