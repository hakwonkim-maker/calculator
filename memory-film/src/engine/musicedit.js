// 배경음악 직접 편집: 곡 조각(클립)을 레이어 위에 배치 · 자르기 · 붙이기 · 페이드 · 교차 페이드
// 순수 함수 (미리보기·내보내기·박자 맞춤·테스트에서 같은 결과)
//
// music.mode   'auto'(기본: 곡을 순서대로 이어 붙이고 반복) | 'edit'(직접 편집)
// music.clips  [{ id, path, start, in, out, fadeIn, fadeOut, layer }]
//              start: 영상에서 시작하는 시각(초) · in/out: 원곡에서 쓰는 구간(초)
// music.layers 레이어 수 · music.muted 소리 끈 레이어 번호 목록
// music.endFade 영상 끝에서 전체 페이드아웃 (초, music.fadeOut 사용 · false면 끔)

export const MAX_LAYERS = 6;
export const MIN_CLIP = 0.5; // 조각 최소 길이(초)
export const MAX_CLIPS = 200; // 내보내기(FFmpeg) 입력 수 한도와 같음

let seq = 0;
export const clipId = () => 'mc' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);

const len = (c) => c.out - c.in;
export const clipEnd = (c) => c.start + len(c);
const r3 = (v) => Math.round(v * 1000) / 1000;
const trackOf = (music, path) => (music.tracks || []).find((t) => t.path === path);

/** 페이드 곡선 (FFmpeg afade curve=qsin 과 같음): 0..1 → 0..1 */
export const fadeCurve = (x) => Math.sin((Math.max(0, Math.min(1, x)) * Math.PI) / 2);

/** 조각의 시각 t(영상 기준)에서의 크기 0..1 */
export function clipGain(c, t) {
  if (t < c.start || t > clipEnd(c)) return 0;
  let g = 1;
  if (c.fadeIn > 0) g *= fadeCurve((t - c.start) / c.fadeIn);
  if (c.fadeOut > 0) g *= fadeCurve((clipEnd(c) - t) / c.fadeOut);
  return g;
}

// ---------------------------------------------------------------- 자동 배치 → 조각
/**
 * 자동 모드의 곡 배치를 조각 목록으로 (미리보기·내보내기의 자동 규칙과 같음)
 * - 곡을 순서대로, 곡 사이는 crossfade 만큼 겹침 (두 레이어를 번갈아)
 * - loop 이면 영상 끝까지 반복
 * - 첫 곡은 전체 페이드인 길이로 시작
 */
export function autoClips(music, total) {
  const tracks = (music?.tracks || []).filter((t) => t.duration > 0.5);
  const out = [];
  if (!tracks.length) return out;
  const xf = Math.max(0, Number(music.crossfade) || 0);
  let s = 0;
  let xPrev = 0;
  for (let i = 0, guard = 0; s < total && guard < 400; i++, guard++) {
    const tr = tracks[i % tracks.length];
    const d = tr.duration;
    const isLast = !music.loop && i + 1 >= tracks.length;
    const next = isLast ? null : tracks[(i + 1) % tracks.length];
    const x = next ? Math.min(xf, d / 2, next.duration / 2) : 0;
    out.push({ id: 'auto' + i, path: tr.path, start: r3(s), in: 0, out: r3(d), fadeIn: r3(i === 0 ? Math.max(0, Number(music.fadeIn) || 0) : xPrev), fadeOut: r3(x), layer: i % 2 });
    if (isLast) break;
    s += d - x;
    xPrev = x;
  }
  return out;
}

/** 실제로 소리가 나는 조각 (곡 목록에 있고, 소리 끈 레이어가 아니고, 길이가 있는 것) */
export function activeClips(music) {
  if (music?.mode !== 'edit') return [];
  const muted = new Set(music.muted || []);
  const paths = new Set((music.tracks || []).map((t) => t.path));
  return (music.clips || []).filter((c) => paths.has(c.path) && !muted.has(c.layer) && len(c) > 0.05);
}

/** 음악이 끝나는 시각 (직접 편집: 마지막 조각 끝 · 자동: 곡 길이 합 - 겹침) */
export function musicEnd(music) {
  if (music?.mode === 'edit') return activeClips(music).reduce((m, c) => Math.max(m, clipEnd(c)), 0);
  const tr = (music?.tracks || []).filter((t) => t.duration > 0);
  if (!tr.length) return 0;
  const xf = Number(music.crossfade) || 0;
  return tr.reduce((s, t, i) => s + t.duration - (i > 0 ? Math.min(xf, t.duration / 2) : 0), 0);
}

/** 음악이 비는 구간 (직접 편집): [[from, to], ...] — 영상 길이 안에서 0.3초 이상 */
export function silentGaps(music, total) {
  const cs = activeClips(music)
    .map((c) => [c.start, clipEnd(c)])
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let t = 0;
  for (const [a, b] of cs) {
    if (a - t > 0.3 && t < total) gaps.push([t, Math.min(a, total)]);
    t = Math.max(t, b);
  }
  if (total - t > 0.3) gaps.push([t, total]);
  return gaps;
}

/** 직접 편집에서 실제로 쓰인 곡 경로 (음악 출처 표기용) */
export function usedPaths(music) {
  if (music?.mode !== 'edit') return new Set((music?.tracks || []).map((t) => t.path));
  return new Set(activeClips(music).map((c) => c.path));
}

// ---------------------------------------------------------------- 편집 연산
const withClips = (music, clips, extra = {}) => ({ ...music, mode: 'edit', clips, ...extra });

/** 자동 → 직접 편집 (지금 들리는 배치 그대로 조각으로) */
export function toEdit(music, total) {
  if (music.mode === 'edit') return music;
  const clips = autoClips(music, total).slice(0, MAX_CLIPS).map((c) => ({ ...c, id: clipId() }));
  return { ...music, mode: 'edit', clips, layers: Math.max(2, music.layers || 2), muted: [], endFade: music.endFade ?? true };
}

/** 직접 편집 → 자동 */
export function toAuto(music) {
  return { ...music, mode: 'auto', clips: [], muted: [] };
}

function overlaps(a, b) {
  return a.start < clipEnd(b) - 1e-6 && b.start < clipEnd(a) - 1e-6;
}

/** 같은 레이어에 겹치지 않는 가장 가까운 시작 위치 (없으면 null) */
function freeStartOnLayer(clips, c, layer, start, maxShift = Infinity) {
  const others = clips.filter((o) => o.id !== c.id && o.layer === layer);
  const L = len(c);
  const ok = (s) => s >= 0 && others.every((o) => !(s < clipEnd(o) - 1e-6 && o.start < s + L - 1e-6));
  if (ok(start)) return start;
  const cands = [];
  for (const o of others) cands.push(clipEnd(o), o.start - L);
  let best = null;
  for (const s of cands) if (ok(s) && Math.abs(s - start) <= maxShift && (best == null || Math.abs(s - start) < Math.abs(best - start))) best = s;
  return best;
}

/** 페이드 합이 조각 길이를 넘지 않게 */
function clampFades(c) {
  const L = len(c);
  let fi = Math.max(0, c.fadeIn || 0);
  let fo = Math.max(0, c.fadeOut || 0);
  if (fi + fo > L) {
    const k = L / (fi + fo);
    fi *= k;
    fo *= k;
  }
  return { ...c, fadeIn: r3(fi), fadeOut: r3(fo) };
}

/**
 * 다른 레이어 조각과 일부 겹치면 겹친 길이만큼 서로 교차 페이드
 * (앞 조각은 페이드아웃, 뒤 조각은 페이드인 — 한쪽이 다른 쪽을 완전히 덮는 경우는 그대로)
 * 자동으로 만든 교차 페이드는 짝(xin/xout = 상대 조각 id)을 기억해, 겹침이 풀리면 함께 0으로 되돌림
 */
function autoCrossfade(clips, id) {
  const c = clips.find((x) => x.id === id);
  if (!c) return clips;
  const patch = new Map();
  const get = (o) => patch.get(o.id) || o;
  let me = { ...c };
  let front = null;
  let back = null;
  for (const o of clips) {
    if (o.id === id || o.layer === c.layer || !overlaps(o, c)) continue;
    if (o.start < c.start && clipEnd(o) < clipEnd(c)) front = o;
    else if (c.start < o.start && clipEnd(c) < clipEnd(o)) back = o;
  }
  // 예전 짝과 더는 겹치지 않으면 자동 페이드 해제
  for (const o of clips) {
    if (o.id === id) continue;
    if (o.xout === id && o !== front) patch.set(o.id, { ...get(o), fadeOut: 0, xout: undefined });
    if (o.xin === id && o !== back) patch.set(o.id, { ...get(o), fadeIn: 0, xin: undefined });
  }
  if (me.xin && (!front || front.id !== me.xin)) me = { ...me, fadeIn: 0, xin: undefined };
  if (me.xout && (!back || back.id !== me.xout)) me = { ...me, fadeOut: 0, xout: undefined };
  if (front) {
    const ov = clipEnd(front) - c.start;
    me = { ...me, fadeIn: ov, xin: front.id };
    patch.set(front.id, { ...get(front), fadeOut: ov, xout: id });
  }
  if (back) {
    const ov = clipEnd(c) - back.start;
    me = { ...me, fadeOut: ov, xout: back.id };
    patch.set(back.id, { ...get(back), fadeIn: ov, xin: id });
  }
  return clips.map((x) => (x.id === id ? clampFades(me) : patch.has(x.id) ? clampFades(patch.get(x.id)) : x));
}

/**
 * 조각 옮기기 (드래그). 같은 레이어에서 겹치면 가장 가까운 빈자리로 붙임
 * opts.cross: 다른 레이어와 겹친 길이만큼 자동 교차 페이드 (기본 켬)
 */
export function moveClip(music, id, start, layer, opts = {}) {
  const clips = music.clips || [];
  const c = clips.find((x) => x.id === id);
  if (!c) return music;
  const layers = Math.max(music.layers || 2, layer + 1);
  const L = Math.max(0, Math.min(MAX_LAYERS - 1, layer));
  const s = freeStartOnLayer(clips, c, L, Math.max(0, start), len(c) * 0.75);
  if (s == null) return music; // 들어갈 자리가 없으면 그대로
  let next = clips.map((x) => (x.id === id ? { ...x, start: r3(s), layer: L } : x));
  if (opts.cross !== false) next = autoCrossfade(next, id);
  return withClips(music, next, { layers: Math.min(MAX_LAYERS, layers) });
}

/** 조각 끝 자르기: edge 'in'(앞) | 'out'(뒤), t = 영상 시각 */
export function trimClip(music, id, edge, t, opts = {}) {
  const clips = music.clips || [];
  const c = clips.find((x) => x.id === id);
  if (!c) return music;
  const dur = trackOf(music, c.path)?.duration ?? c.out;
  const others = clips.filter((o) => o.id !== id && o.layer === c.layer);
  let n;
  if (edge === 'in') {
    // 앞쪽: 원곡 시작(in=0) 보다 앞으로는 못 늘림, 같은 레이어 앞 조각에 닿으면 멈춤
    const prevEnd = others.filter((o) => clipEnd(o) <= c.start + 1e-6).reduce((m, o) => Math.max(m, clipEnd(o)), 0);
    const ns = Math.max(prevEnd, c.start - c.in, Math.min(t, clipEnd(c) - MIN_CLIP));
    n = { ...c, start: r3(ns), in: r3(c.in + (ns - c.start)) };
  } else {
    const nextStart = others.filter((o) => o.start >= clipEnd(c) - 1e-6).reduce((m, o) => Math.min(m, o.start), Infinity);
    const ne = Math.min(nextStart, c.start + (dur - c.in), Math.max(t, c.start + MIN_CLIP));
    n = { ...c, out: r3(c.in + (ne - c.start)) };
  }
  let next = clips.map((x) => (x.id === id ? clampFades(n) : x));
  if (opts.cross !== false) next = autoCrossfade(next, id);
  return withClips(music, next);
}

/**
 * 재생 위치 t 에서 조각 나누기 → [앞, 뒤]. 이음매에서 소리 크기가 끊기지 않게:
 * 페이드인 도중이면 앞 조각 전체가 페이드인, 페이드아웃 도중이면 뒤 조각 전체가 페이드아웃
 */
export function splitClip(music, id, t) {
  const clips = music.clips || [];
  const c = clips.find((x) => x.id === id);
  if (!c || t <= c.start + 0.1 || t >= clipEnd(c) - 0.1) return music;
  const cut = c.in + (t - c.start);
  const la = t - c.start;
  const lb = clipEnd(c) - t;
  const fi = c.fadeIn || 0;
  const fo = c.fadeOut || 0;
  const a = { ...c, out: r3(cut), fadeIn: r3(Math.min(fi, la)), fadeOut: 0, xout: undefined };
  const b = { ...c, id: clipId(), start: r3(t), in: r3(cut), fadeIn: 0, fadeOut: r3(Math.min(fo, lb)), xin: undefined };
  if (fo > lb) b.fadeOut = r3(lb); // 자른 곳이 페이드아웃 안: 뒤 조각이 1→0
  if (fi > la) a.fadeIn = r3(la); // 자른 곳이 페이드인 안: 앞 조각이 0→1
  const i = clips.indexOf(c);
  return withClips(music, [...clips.slice(0, i), clampFades(a), clampFades(b), ...clips.slice(i + 1)]);
}

/** 원곡에서 쓸 구간(in~out)만 바꾸기 — 영상 위 시작 위치는 그대로 (같은 레이어 다음 조각에 닿으면 멈춤) */
export function setRange(music, id, inT, outT) {
  const clips = music.clips || [];
  const c = clips.find((x) => x.id === id);
  if (!c) return music;
  const dur = trackOf(music, c.path)?.duration ?? Math.max(c.out, outT);
  let i = Math.max(0, Math.min(Number(inT), dur - MIN_CLIP));
  let o = Math.max(i + MIN_CLIP, Math.min(Number(outT), dur));
  const nextStart = clips.filter((x) => x.id !== id && x.layer === c.layer && x.start >= c.start + 1e-6).reduce((m, x) => Math.min(m, x.start), Infinity);
  o = Math.min(o, i + (nextStart - c.start));
  if (o - i < MIN_CLIP) return music;
  return withClips(music, clips.map((x) => (x.id === id ? clampFades({ ...x, in: r3(i), out: r3(o) }) : x)));
}

/** 조각을 시각 at 에 붙여넣기 (원하는 레이어가 차 있으면 빈 레이어 · 새 레이어) */
export function placeClip(music, clip, at, layer = 0) {
  const clips = music.clips || [];
  if (clips.length >= MAX_CLIPS) return music;
  const c = { ...clip, id: clipId(), start: r3(Math.max(0, at)) };
  const nLayers = Math.max(2, music.layers || 2);
  const order = [layer, ...Array.from({ length: MAX_LAYERS }, (_, k) => k).filter((k) => k !== layer)];
  for (const L of order) {
    const free = clips.filter((o) => o.layer === L).every((o) => !overlaps(o, { ...c, layer: L }));
    if (free) return withClips(music, [...clips, { ...c, layer: L }], { layers: Math.min(MAX_LAYERS, Math.max(nLayers, L + 1)) });
  }
  // 모든 레이어가 차 있으면 원하는 레이어의 가장 가까운 빈자리
  const s = freeStartOnLayer(clips, c, layer, c.start);
  return s == null ? music : withClips(music, [...clips, { ...c, start: r3(s), layer }]);
}

/** 곡 하나를 맨 끝에 이어 붙이기 (앞 조각과 xf 초 교차 페이드, 레이어 번갈아) */
export function appendTrack(music, track, xf = 3) {
  const clips = music.clips || [];
  const d = track.duration || 0;
  if (d <= 0.5) return music;
  if (!clips.length) {
    const c = { id: clipId(), path: track.path, start: 0, in: 0, out: r3(d), fadeIn: r3(Math.max(0, Number(music.fadeIn) || 0)), fadeOut: 0, layer: 0 };
    return withClips(music, [c], { layers: Math.max(2, music.layers || 2) });
  }
  const last = clips.reduce((a, b) => (clipEnd(b) > clipEnd(a) ? b : a));
  const x = Math.min(xf, len(last) / 2, d / 2);
  const start = Math.max(0, clipEnd(last) - x);
  const layer = (last.layer + 1) % Math.max(2, music.layers || 2);
  let res = placeClip(music, { path: track.path, in: 0, out: r3(d), fadeIn: r3(x), fadeOut: 0, layer }, start, layer);
  if (res === music) return music;
  return withClips(res, res.clips.map((c) => (c.id === last.id ? clampFades({ ...c, fadeOut: Math.max(c.fadeOut || 0, x) }) : c)));
}

/**
 * 영상 길이 채우기: 마지막 조각을 교차 페이드로 이어 붙이며 영상 끝까지 반복.
 * 영상 끝을 넘는 부분은 들리지 않고, 끝에서는 전체 페이드아웃(endFade)이 적용됨.
 */
export function fillToEnd(music, total, xf = 3) {
  let m = music;
  let guard = 0;
  while (guard++ < 60) {
    const clips = activeClips(m).length ? activeClips(m) : m.clips || [];
    if (!clips.length) return m;
    const last = clips.reduce((a, b) => (clipEnd(b) > clipEnd(a) ? b : a));
    if (clipEnd(last) >= total - 0.05) break;
    if ((m.clips || []).length >= MAX_CLIPS) break;
    const x = Math.min(xf, len(last) / 2);
    const start = clipEnd(last) - x;
    const layer = (last.layer + 1) % Math.max(2, m.layers || 2);
    const next = placeClip(m, { path: last.path, in: last.in, out: last.out, fadeIn: r3(x), fadeOut: 0, layer }, start, layer);
    if (next === m) break;
    m = withClips(next, next.clips.map((c) => (c.id === last.id ? clampFades({ ...c, fadeOut: Math.max(c.fadeOut || 0, x) }) : c)));
  }
  return m;
}

export function deleteClips(music, ids) {
  const set = new Set(ids);
  return withClips(music, (music.clips || []).filter((c) => !set.has(c.id)));
}

/** 페이드 길이 정하기 (조각 길이를 넘지 않게) */
export function setFade(music, id, which, v) {
  return withClips(
    music,
    (music.clips || []).map((c) => {
      if (c.id !== id) return c;
      const L = len(c);
      const other = which === 'fadeIn' ? c.fadeOut || 0 : c.fadeIn || 0;
      return { ...c, [which]: r3(Math.max(0, Math.min(Number(v) || 0, L - other))) };
    }),
  );
}

/** 곡 목록에서 지운 곡의 조각 정리 */
export function removeTrackClips(music, path) {
  if (music.mode !== 'edit') return music;
  return { ...music, clips: (music.clips || []).filter((c) => c.path !== path) };
}

export function addLayer(music) {
  return { ...music, layers: Math.min(MAX_LAYERS, Math.max(2, music.layers || 2) + 1) };
}
/** 빈 레이어 지우기 (뒤 레이어는 한 칸씩 올라옴) */
export function removeLayer(music, layer) {
  const clips = music.clips || [];
  if (clips.some((c) => c.layer === layer)) return music;
  return {
    ...music,
    clips: clips.map((c) => (c.layer > layer ? { ...c, layer: c.layer - 1 } : c)),
    muted: (music.muted || []).filter((k) => k !== layer).map((k) => (k > layer ? k - 1 : k)),
    layers: Math.max(1, (music.layers || 2) - 1),
  };
}
export function toggleMute(music, layer) {
  const m = new Set(music.muted || []);
  m.has(layer) ? m.delete(layer) : m.add(layer);
  return { ...music, muted: [...m] };
}

/** 드래그 시 달라붙을 위치: 다른 조각 끝, 0, 재생 위치, 영상 끝 */
export function snapTime(music, id, t, points, tol) {
  let best = t;
  let bd = tol;
  const cand = [0, ...points];
  for (const c of music.clips || []) if (c.id !== id) cand.push(c.start, clipEnd(c));
  for (const p of cand) {
    const d = Math.abs(p - t);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------- 박자 (직접 편집)
/**
 * 조각들의 박자를 영상 시각으로: 겹치는 곳에서는 크게 들리는 조각의 박자를 우선
 * 반환: [{ t, s }] (beatsOnTimeline 과 같은 모양)
 */
export function editBeats(music, total) {
  const tracks = new Map((music.tracks || []).map((t) => [t.path, t]));
  const all = [];
  for (const c of activeClips(music)) {
    const tr = tracks.get(c.path);
    const bs = tr?.beats || [];
    for (let k = 0; k < bs.length; k++) {
      const b = bs[k];
      if (b < c.in || b > c.out) continue;
      const t = c.start + (b - c.in);
      if (t < 0 || t > total) continue;
      const g = clipGain(c, t);
      if (g < 0.35) continue;
      all.push({ t, s: tr.beatStrength?.[k] ?? 0.5, g });
    }
  }
  all.sort((a, b) => a.t - b.t);
  const out = [];
  for (const b of all) {
    const prev = out[out.length - 1];
    if (prev && b.t - prev.t < 0.12) {
      if (b.g > prev.g) out[out.length - 1] = b;
      continue;
    }
    out.push(b);
  }
  return out.map(({ t, s }) => ({ t, s }));
}
