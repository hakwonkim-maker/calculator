// 프로젝트 → 타임라인(세그먼트 배열) 변환
// 세그먼트는 앞뒤 전환 구간만큼 서로 겹친다. 전환 중에도 두 장면의 모션이 계속 움직여
// "멈춘 사진이 바뀌는" 느낌이 아니라 흐르듯 이어지게 한다.

import { TRANSITION_STYLES, MOTION_LEVELS } from './presets.js';
import { hashStr, rng, weightedPick } from './math.js';

const INTRO_EXIT = { golden: 'lightLeak', mosaic: 'zoomBlur', light: 'dipWhite' };
const MOTIONS = [
  ['zoomIn', 3],
  ['zoomOut', 2.4],
  ['panLeft', 1.5],
  ['panRight', 1.5],
  ['panUp', 0.8],
  ['panDown', 0.6],
];

export const CHAPTER_DEFAULT_DURATION = 4.2;

export function buildTimeline(project) {
  const st = project.style;
  const T = Math.max(0.3, Number(st.transitionDuration) || 1.2);
  const seed = st.seed || 1;
  const pool = (TRANSITION_STYLES[st.transitionStyle] || TRANSITION_STYLES.elegant).pool;
  const motionAmt = MOTION_LEVELS[st.motion] ?? 1;

  const raw = [];
  if (project.intro.enabled) raw.push({ type: 'intro', key: 'intro', dur: Number(project.intro.duration) || 10 });
  for (const it of project.items) {
    if (it.type === 'photo') raw.push({ type: 'photo', key: it.id, item: it, dur: (Number(it.duration) || st.photoDuration) + T });
    else if (it.type === 'chapter') raw.push({ type: 'chapter', key: it.id, item: it, dur: (Number(it.duration) || CHAPTER_DEFAULT_DURATION) + T });
  }
  if (project.outro.enabled) raw.push({ type: 'outro', key: 'outro', dur: Number(project.outro.duration) || 10 });

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
    s.dur = Math.max(s.dur, s.tIn + s.tOut + 0.4);
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
      prevMotion = m;
      s.motion = { type: m, amount: motionAmt, fx: r() * 2 - 1, fy: r() * 2 - 1 };
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

/** 사진 1장당 시간을 음악 길이에 맞게 역산 */
export function fitPhotoDurationToLength(project, targetSeconds) {
  const nPhotos = project.items.filter((i) => i.type === 'photo' && !i.duration).length;
  if (!nPhotos) return null;
  const probe = (pd) => buildTimeline({ ...project, style: { ...project.style, photoDuration: pd } }).total;
  const t1 = probe(3);
  const t2 = probe(4);
  const slope = t2 - t1; // = 사진 수 (클램프 없을 때)
  if (slope <= 0) return null;
  const pd = 3 + (targetSeconds - t1) / slope;
  return Math.round(pd * 100) / 100;
}
