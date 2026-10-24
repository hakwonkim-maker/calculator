// 결정적(deterministic) 난수 · 이징 유틸리티
// 미리보기와 최종 출력이 프레임 단위로 동일하도록 모든 랜덤은 시드 기반이다.

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weightedPick(r, entries, exclude) {
  const list = entries.filter(([k]) => k !== exclude);
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [k, w] of list) {
    if ((x -= w) <= 0) return k;
  }
  return list[list.length - 1][0];
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/** 시작~끝 구간에서 들어오고, outStart~outEnd 구간에서 나가는 0..1 알파 */
export function inOut(t, inStart, inEnd, outStart, outEnd, ease = easeOutCubic) {
  const a = ease(prog(t, inStart, inEnd));
  if (outStart == null) return a;
  return a * (1 - easeInOutSine(prog(t, outStart, outEnd)));
}

export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
