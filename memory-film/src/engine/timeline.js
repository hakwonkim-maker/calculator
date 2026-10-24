// 프로젝트 → 타임라인(세그먼트 배열) 변환
// 세그먼트는 앞뒤 전환 구간만큼 서로 겹친다. 전환 중에도 두 장면의 모션이 계속 움직여
// "멈춘 사진이 바뀌는" 느낌이 아니라 흐르듯 이어지게 한다.

import { TRANSITION_STYLES, MOTION_LEVELS } from './presets.js';
import { hashStr, rng, weightedPick } from './math.js';

const INTRO_EXIT = { golden: 'lightLeak', mosaic: 'zoomBlur', light: 'dipWhite', cinematic: 'dipBlack', polaroid: 'blurDissolve', bloom: 'dipWhite', minimal: 'fade', filmleader: 'filmBurn' };
const MOTIONS = [
  ['zoomIn', 3],
  ['zoomOut', 2.4],
  ['panLeft', 1.5],
  ['panRight', 1.5],
  ['panUp', 0.8],
  ['panDown', 0.6],
];

export const CHAPTER_DEFAULT_DURATION = 4.2;
export const MIN_PHOTO_DURATION = 0.5;

/** 사진이 짧으면 전환도 짧게 (사진이 최소 0.4초 + 전환의 절반 이상은 온전히 보이도록) */
function effectiveT(T, pd) {
  return Math.max(0.2, Math.min(T, (pd - 0.25) * 0.6));
}

/**
 * 타임라인 생성.
 * style.lengthMode === 'total' 이면 style.targetDuration(초)에 맞도록
 * '사진 1장당 시간'을 자동 계산한다 (사진을 더 넣어도 전체 길이는 유지).
 */
export function buildTimeline(project) {
  const st = project.style;
  const T = Math.max(0.3, Number(st.transitionDuration) || 1.2);
  const nAuto = project.items.filter((i) => i.type === 'photo' && !Number(i.duration)).length;
  const target = Number(st.targetDuration) || 0;
  if (st.lengthMode !== 'total' || !nAuto || target <= 0) {
    const pd = Math.max(MIN_PHOTO_DURATION, Number(st.photoDuration) || 4.5);
    return { ...buildCore(project, pd, effectiveT(T, pd)), photoDuration: pd };
  }
  // 전체 길이 고정: 총 길이(pd)는 거의 선형이므로 할선법으로 2~4회 만에 수렴
  const total = (pd) => buildCore(project, pd, effectiveT(T, pd)).total;
  let pd = 3 + (target - total(3)) / Math.max(1e-6, total(4) - total(3));
  for (let k = 0; k < 4; k++) {
    pd = Math.min(60, Math.max(MIN_PHOTO_DURATION, pd));
    const err = target - total(pd);
    if (Math.abs(err) < 0.02) break;
    const slope = (total(pd + 0.5) - total(pd)) / 0.5;
    pd += err / Math.max(1e-6, slope);
  }
  pd = Math.min(60, Math.max(MIN_PHOTO_DURATION, pd));
  const tl = buildCore(project, pd, effectiveT(T, pd));
  return { ...tl, photoDuration: pd, target, fitShort: tl.total > target + 0.5 };
}

function buildCore(project, photoDuration, T) {
  const st = { ...project.style, photoDuration };
  const seed = st.seed || 1;
  const pool = (TRANSITION_STYLES[st.transitionStyle] || TRANSITION_STYLES.elegant).pool;
  const motionAmt = MOTION_LEVELS[st.motion] ?? 1;

  const raw = [];
  if (project.intro.enabled) raw.push({ type: 'intro', key: 'intro', dur: Number(project.intro.duration) || 10 });
  for (const it of project.items) {
    if (it.type === 'photo') raw.push({ type: 'photo', key: it.id, item: it, dur: (Number(it.duration) || st.photoDuration) + T });
    else if (it.type === 'chapter') raw.push({ type: 'chapter', key: it.id, item: it, dur: (Number(it.duration) || CHAPTER_DEFAULT_DURATION) + T });
  }
  if (project.outro.enabled) {
    let od = Number(project.outro.duration) || 10;
    // 크레딧이 길면 읽을 수 있는 속도(초당 약 2.2줄)가 되도록 엔딩을 자동으로 늘림
    if (project.outro.style === 'credits') od = Math.max(od, (String(project.text.credits || '').split('\n').length / 2.2 + 3) / 0.62 + 2);
    raw.push({ type: 'outro', key: 'outro', dur: od });
  }

  // 경계(전환) 결정
  let prevTrans = null;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1];
    const b = raw[i];
    let id = null;
    let dur = T;
    const own = a.type === 'intro' ? project.intro.transition : a.item?.transition;
    const explicit = own && own !== 'auto' ? own : null;
    if (explicit) id = explicit;
    else if (a.type === 'intro') {
      id = INTRO_EXIT[project.intro.style] || 'lightLeak';
      dur = Math.max(T, 1.8);
    } else if (b.type === 'outro') {
      id = 'blurDissolve';
      dur = Math.max(T, 2.0);
    } else if (b.type === 'chapter') {
      id = 'dipBlack';
      dur = Math.max(T, 1.4);
    } else if (a.type === 'chapter') {
      id = 'blurDissolve';
      dur = Math.max(T, 1.4);
    } else {
      const r = rng(hashStr(`${seed}|${a.key}|${b.key}`));
      id = weightedPick(r, pool, prevTrans);
    }
    if (a.type === 'intro' && explicit) dur = Math.max(T, 1.8);
    if (id === 'none') dur = 0.0001;
    prevTrans = id;
    b.transIn = id;
    b.tIn = dur;
    a.tOut = dur;
  }

  // 길이 보정: 전환이 겹쳐도 장면이 최소 0.4초는 단독으로 보이도록
  for (const s of raw) {
    s.tIn = s.tIn || 0;
    s.tOut = s.tOut || 0;
    s.dur = Math.max(s.dur, s.tIn + s.tOut + (s.type === 'photo' ? 0.25 : 0.4));
  }

  // 시작 시간 계산
  let t = 0;
  let prevMotion = null;
  raw.forEach((s, i) => {
    s.index = i;
    s.start = t;
    t = s.start + s.dur - s.tOut;
    if (s.type === 'photo') {
      const r = rng(hashStr(`${seed}|m|${s.key}`));
      let m = weightedPick(r, MOTIONS, prevMotion);
      const fx = r() * 2 - 1;
      const fy = r() * 2 - 1;
      const own = s.item.motion;
      if (own && own !== 'auto') m = own === 'none' ? 'zoomIn' : own;
      prevMotion = m;
      s.motion = { type: m, amount: own === 'none' ? 0 : motionAmt, fx, fy };
    }
  });
  // 챕터 카드 배경으로 쓸 다음 사진
  raw.forEach((s, i) => {
    if (s.type !== 'chapter') return;
    const nx = raw.slice(i + 1).find((x) => x.type === 'photo') || raw.slice(0, i).reverse().find((x) => x.type === 'photo');
    s.nextPhoto = nx ? nx.item : null;
  });
  const last = raw[raw.length - 1];
  const total = last ? last.start + last.dur : 0;

  // 인트로/아웃트로 갤러리용 사진 샘플 (최대 30장, 고르게)
  const photos = project.items.filter((it) => it.type === 'photo');
  const gallery = sampleEven(photos, 30);

  return { segments: raw, total, gallery, T };
}

function sampleEven(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor((i * arr.length) / n)]);
  return out;
}

/** 시간 t에서 보이는 세그먼트(최대 2개)와 전환 진행률 */
export function activeAt(tl, t) {
  const segs = tl.segments;
  if (!segs.length) return null;
  t = Math.min(Math.max(t, 0), Math.max(0, tl.total - 1e-4));
  // 이진 탐색: start <= t 인 마지막 세그먼트
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  const b = segs[lo];
  const a = lo > 0 ? segs[lo - 1] : null;
  if (a && t < a.start + a.dur && b.tIn > 0.001) {
    return { from: a, to: b, p: (t - b.start) / b.tIn, transition: b.transIn };
  }
  return { from: b, to: null, p: 0, transition: 'none' };
}

/** 목표 길이에 맞는 사진 1장당 시간 (사진이 없으면 null) */
export function fitPhotoDurationToLength(project, targetSeconds) {
  const nPhotos = project.items.filter((i) => i.type === 'photo' && !Number(i.duration)).length;
  if (!nPhotos) return null;
  const tl = buildTimeline({ ...project, style: { ...project.style, lengthMode: 'total', targetDuration: targetSeconds } });
  return Math.round(tl.photoDuration * 100) / 100;
}

/** 전체 길이 고정 모드에서 최소로 줄였을 때의 길이 (사진이 너무 많은지 판단용) */
export function minimumLength(project) {
  const T = Math.max(0.3, Number(project.style.transitionDuration) || 1.2);
  return buildCore(project, MIN_PHOTO_DURATION, effectiveT(T, MIN_PHOTO_DURATION)).total;
}
