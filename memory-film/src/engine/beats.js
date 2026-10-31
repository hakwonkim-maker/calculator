// 음악 박자 분석 + 영상 타임라인 위의 박자 위치
// 1) 스펙트럼 변화량(onset) → 2) 자기상관으로 템포(BPM) → 3) 동적 계획법으로 박자 위치 추적 (Ellis 2007 방식)
// 순수 함수라 미리보기·출력·테스트에서 같은 결과를 낸다.

const TARGET_SR = 22050;
/** 이 값 이상이면 '박자가 뚜렷한 곡' */
export const BEAT_CLEAR = 2.0;
const N = 1024;
const HOP = 256;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** 모노 신호 → onset 세기(프레임별), 프레임 간격(초) */
export function onsetEnvelope(x, sr) {
  // 22kHz 근처로 줄이기 (평균 내며 솎아냄)
  const f = Math.max(1, Math.round(sr / TARGET_SR));
  const len = Math.floor(x.length / f);
  const y = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let k = 0; k < f; k++) s += x[i * f + k];
    y[i] = s / f;
  }
  const rate = sr / f;
  const frames = Math.max(0, Math.floor((len - N) / HOP));
  const bins = Math.min(N / 2, Math.round((8000 / rate) * N)); // 8kHz 이하만
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  // 로그 간격 대역(약 24개)으로 묶어 대역마다 같은 비중 → 베이스·킥이 하이햇에 묻히지 않음
  const edges = [];
  for (let k = 0; k <= 24; k++) edges.push(Math.min(bins, Math.max(1, Math.round(Math.pow(bins, k / 24)))));
  const NB = edges.length - 1;
  let prev = new Float32Array(NB);
  let cur = new Float32Array(NB);
  const env = new Float32Array(frames);
  for (let fr = 0; fr < frames; fr++) {
    const o = fr * HOP;
    for (let i = 0; i < N; i++) {
      re[i] = y[o + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    for (let k = 0; k < NB; k++) {
      let e = 0;
      const a = edges[k];
      const b = Math.max(a + 1, edges[k + 1]);
      for (let bb = a; bb < b; bb++) e += re[bb] * re[bb] + im[bb] * im[bb];
      const m = Math.log1p(1000 * Math.sqrt(e / (b - a)));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) flux += d;
    }
    env[fr] = fr ? flux : 0;
    [prev, cur] = [cur, prev];
  }
  // 느린 변화 제거(국소 평균 빼기) + 표준화
  const w = Math.round(0.4 / (HOP / rate));
  const out = new Float32Array(frames);
  let acc = 0;
  for (let i = 0; i < frames; i++) {
    acc += env[i];
    if (i > 2 * w) acc -= env[i - 2 * w - 1];
    const mean = acc / Math.min(i + 1, 2 * w + 1);
    out[i] = Math.max(0, env[Math.max(0, i - w)] - mean);
  }
  // 위 계산은 w 프레임 늦으므로 앞으로 당김
  const env2 = new Float32Array(frames);
  for (let i = 0; i < frames; i++) env2[i] = out[Math.min(frames - 1, i + w)];
  let s2 = 0;
  for (let i = 0; i < frames; i++) s2 += env2[i] * env2[i];
  const sd = Math.sqrt(s2 / Math.max(1, frames)) || 1;
  for (let i = 0; i < frames; i++) env2[i] /= sd;
  // 분석 창 길이 때문에 onset이 실제보다 약 0.8창만큼 일찍 잡힘 → 보정값(초)
  return { env: env2, dt: HOP / rate, lag: (N * 0.8) / rate };
}

/** 템포 추정: 자기상관 + 120BPM 근처 선호. 반환 { period(프레임), bpm, confidence } */
export function estimateTempo(env, dt) {
  const minLag = Math.floor(60 / 200 / dt);
  const maxLag = Math.ceil(60 / 50 / dt);
  const n = env.length;
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += env[i] * env[i - lag];
    ac[lag] = s / (n - lag);
  }
  let best = minLag;
  let bestV = -Infinity;
  let sum = 0;
  let sum2 = 0;
  let cnt = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * dt);
    const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const v = ac[lag] * w;
    sum += ac[lag];
    sum2 += ac[lag] * ac[lag];
    cnt++;
    if (v > bestV) {
      bestV = v;
      best = lag;
    }
  }
  // 포물선 보간으로 소수점 주기
  const a = ac[best - 1] || 0;
  const b = ac[best];
  const c = ac[best + 1] || 0;
  const den = a - 2 * b + c;
  const period = best + (den ? (0.5 * (a - c)) / den : 0);
  // 신뢰도: 템포 주기의 자기상관이 다른 주기들보다 얼마나 두드러지는지 (표준점수)
  const mean = sum / cnt;
  const sd = Math.sqrt(Math.max(1e-12, sum2 / cnt - mean * mean));
  const confidence = (ac[best] - mean) / sd;
  return { period, bpm: 60 / (period * dt), confidence };
}

/** 동적 계획법 박자 추적 → 박자 프레임 목록 */
export function trackBeats(env, period, tightness = 100) {
  const n = env.length;
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(period / 2);
  const hi = Math.round(period * 2);
  for (let t = 0; t < n; t++) {
    let bestV = 0;
    let bestI = -1;
    for (let tau = t - hi; tau <= t - lo; tau++) {
      if (tau < 0) continue;
      const pen = Math.log((t - tau) / period);
      const v = score[tau] - tightness * pen * pen;
      if (bestI < 0 || v > bestV) {
        bestV = v;
        bestI = tau;
      }
    }
    score[t] = env[t] + (bestI >= 0 ? Math.max(0, bestV) : 0);
    back[t] = bestI >= 0 && bestV > 0 ? bestI : -1;
  }
  // 마지막 한 주기 안에서 점수가 가장 높은 곳부터 거꾸로 따라감
  let end = n - 1;
  for (let t = Math.max(0, n - Math.round(period)); t < n; t++) if (score[t] > score[end]) end = t;
  const beats = [];
  for (let t = end; t >= 0; t = back[t]) beats.push(t);
  return beats.reverse();
}

/**
 * 모노 PCM → { bpm, confidence, beats: [초], strength: [0~1] }
 * confidence: BEAT_CLEAR 이상이면 박자가 뚜렷한 곡(팝·행진곡), 낮으면 박자가 자유로운 클래식 등
 */
export function detectBeats(x, sr) {
  const { env, dt, lag } = onsetEnvelope(x, sr);
  if (env.length < 64) return { bpm: 0, confidence: 0, beats: [], strength: [] };
  const { period, bpm } = estimateTempo(env, dt);
  const frames = trackBeats(env, period);
  // 신뢰도: 박자 위치의 onset이 '박자 사이(반 박 지점)'보다 얼마나 센지 — 규칙적인 박이 있는 곡일수록 큼
  let on = 0;
  let mid = 0;
  for (let k = 0; k + 1 < frames.length; k++) {
    const f = frames[k];
    on += Math.max(env[f] || 0, env[f - 1] || 0, env[f + 1] || 0);
    const m = Math.round((frames[k] + frames[k + 1]) / 2);
    mid += Math.max(env[m] || 0, env[m - 1] || 0, env[m + 1] || 0);
  }
  const confidence = on / Math.max(1e-6, mid + 0.1 * on);
  // 박자 세기: 박자 주변(±2프레임) onset 최대값, 0~1로 정규화
  const raw = frames.map((f) => Math.max(env[f] || 0, env[f - 1] || 0, env[f + 1] || 0, env[f - 2] || 0, env[f + 2] || 0));
  const sorted = raw.slice().sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.9)] || 1;
  return {
    bpm: Math.round(bpm * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    beats: frames.map((f) => Math.round((f * dt + lag) * 1000) / 1000),
    strength: raw.map((v) => Math.round(Math.min(1, v / ref) * 100) / 100),
  };
}

/**
 * 음악 트랙 배치(미리보기·FFmpeg와 같은 규칙: 크로스페이드·반복)에 따라 영상 시간 위의 박자 목록
 * 반환: [{ t, s }] (t: 영상 시각, s: 세기)
 */
export function beatsOnTimeline(music, total) {
  const tracks = (music?.tracks || []).filter((t) => t.duration > 0.5);
  if (!tracks.length || !tracks.some((t) => t.beats?.length)) return [];
  const xf = Number(music.crossfade) || 0;
  const out = [];
  let s = 0;
  let xPrev = 0;
  for (let i = 0, guard = 0; s < total && guard < 400; i++, guard++) {
    const tr = tracks[i % tracks.length];
    const d = tr.duration;
    const isLast = !music.loop && i + 1 >= tracks.length;
    const next = isLast ? null : tracks[(i + 1) % tracks.length];
    const x = next ? Math.min(xf, d / 2, next.duration / 2) : 0;
    const bs = tr.beats || [];
    for (let k = 0; k < bs.length; k++) {
      const b = bs[k];
      // 크로스페이드 구간에서는 다음 곡의 박자를 우선 (겹치는 박자 중복 방지)
      if (x > 0 && b > d - x * 0.5) break;
      if (xPrev > 0 && b < xPrev * 0.5) continue;
      out.push({ t: s + b, s: tr.beatStrength?.[k] ?? 0.5 });
    }
    if (isLast) break;
    s += d - x;
    xPrev = x;
  }
  return out.filter((b) => b.t <= total);
}
