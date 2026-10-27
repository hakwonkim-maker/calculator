// 옛 사진 자동 보정: 바랜 색(누렇게 변한 인화지), 흐릿한 대비, 빠진 채도를 되살린다.
// 순수 함수(RGBA 배열 입력) — 미리보기·출력·테스트에서 같은 결과.
//
// 정책(policy)
//  'A' : 옛 사진처럼 보이는 사진(바램·색 틀어짐·흐린 대비)만 복원          ← 기본값
//  'B' : 옛 사진은 복원 + 나머지 사진도 밝기·대비를 살짝 정리
//  '1' : 이 사진은 무조건 복원 (사진별 '보정 켜기')

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** 색 통계: 채널별 하위·상위 백분위, 밝기 범위, 평균 채도, 색 틀어짐 */
export function toneStats(data, step = 4) {
  const hr = new Uint32Array(256);
  const hg = new Uint32Array(256);
  const hb = new Uint32Array(256);
  const hl = new Uint32Array(256);
  let n = 0;
  let sumS = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    hr[r]++;
    hg[g]++;
    hb[b]++;
    const l = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    hl[l]++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    sumS += mx ? (mx - mn) / mx : 0;
    sr += r;
    sg += g;
    sb += b;
    n++;
  }
  const pct = (h, p) => {
    const target = n * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += h[v];
      if (acc >= target) return v;
    }
    return 255;
  };
  const lo = [pct(hr, 0.004), pct(hg, 0.004), pct(hb, 0.004)];
  const hi = [pct(hr, 0.996), pct(hg, 0.996), pct(hb, 0.996)];
  const mean = [sr / n, sg / n, sb / n];
  const gray = (mean[0] + mean[1] + mean[2]) / 3;
  return {
    lo,
    hi,
    loL: pct(hl, 0.004),
    hiL: pct(hl, 0.996),
    meanL: (0.299 * mean[0] + 0.587 * mean[1] + 0.114 * mean[2]) / 255,
    sat: sumS / n,
    mean,
    cast: Math.max(...mean.map((m) => Math.abs(m - gray))) / 255,
  };
}

/** 옛 사진처럼 보이는지: 바랜 대비, 누렇게(또는 붉게) 틀어진 색, 빠진 채도 */
export function looksOld(st) {
  const range = st.hiL - st.loL;
  const faded = range < 190 || st.loL > 28 || st.hiL < 222;
  const warmCast = st.cast > 0.055 && st.mean[0] > st.mean[2];
  const dull = st.sat < 0.16;
  return (faded && (warmCast || dull)) || (warmCast && st.cast > 0.09) || range < 150;
}

/**
 * 보정 곡선 만들기
 * restore: 채널별 레벨(색 틀어짐·바램 제거) + 밝기 감마 + 채도 복원
 * gentle : 밝기 범위만 살짝 펴고 감마 약간 (색은 그대로)
 */
export function makeCurves(st, mode) {
  const luts = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
  const mono = st.sat < 0.06; // 흑백(또는 세피아) 사진
  for (let c = 0; c < 3; c++) {
    let lo;
    let hi;
    if (mode === 'restore') {
      // 채널별로 펴면 색 틀어짐이 사라짐. 흑백 사진은 밝기 기준과 섞어 지나친 중성화를 피함
      const w = mono ? 0.6 : 0.85;
      lo = st.lo[c] * w + st.loL * (1 - w);
      hi = st.hi[c] * w + st.hiL * (1 - w);
    } else {
      lo = st.loL * 0.6;
      hi = 255 - (255 - st.hiL) * 0.6;
    }
    // 과도한 늘림 방지 (최대 2.6배, 원래 범위가 아주 좁은 노이즈 사진 보호)
    if (hi - lo < 98) {
      const m = (hi + lo) / 2;
      lo = m - 49;
      hi = m + 49;
    }
    for (let v = 0; v < 256; v++) luts[c][v] = clamp255(Math.round(((v - lo) / (hi - lo)) * 255));
  }
  // 펴진 뒤의 평균 밝기를 0.47 근처로 (감마)
  const after = (c) => luts[c][Math.round(clamp255(st.mean[c]))] / 255;
  const ml = Math.max(0.03, 0.299 * after(0) + 0.587 * after(1) + 0.114 * after(2));
  let gamma = Math.log(0.47) / Math.log(ml);
  gamma = Math.min(1.35, Math.max(0.75, gamma));
  if (mode !== 'restore') gamma = 1 + (gamma - 1) * 0.5;
  const s = mode === 'restore' ? 0.1 : 0.05; // 약한 S자 대비
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      let x = Math.pow(luts[c][v] / 255, gamma);
      x = x + s * Math.sin(2 * Math.PI * x) * -0.159 * 2; // 중간은 그대로, 어두운 곳·밝은 곳 대비 강화
      luts[c][v] = clamp255(Math.round(x * 255));
    }
  }
  // 채도 복원: 바랜 컬러 사진만 (흑백은 그대로)
  const sat = mode === 'restore' && !mono ? Math.min(1.4, Math.max(1, 1 + (0.3 - st.sat) * 1.8)) : 1;
  return { luts, sat };
}

export function applyCurves(data, { luts, sat }) {
  const [lr, lg, lb] = luts;
  for (let i = 0; i < data.length; i += 4) {
    let r = lr[data[i]];
    let g = lg[data[i + 1]];
    let b = lb[data[i + 2]];
    if (sat !== 1) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp255(l + (r - l) * sat);
      g = clamp255(l + (g - l) * sat);
      b = clamp255(l + (b - l) * sat);
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return data;
}

/** 정책에 따라 보정할지 결정 → 'restore' | 'gentle' | null */
export function decide(st, policy) {
  if (policy === '1') return 'restore';
  if (looksOld(st)) return 'restore';
  if (policy === 'B') return 'gentle';
  return null;
}

/** 사진 아이템 + 스타일 → 정책 태그 (null이면 보정 안 함) */
export function enhancePolicy(item, styleEnhance) {
  if (item?.enhance === 'off') return null;
  if (item?.enhance === 'on') return '1';
  if (styleEnhance === 'off') return null;
  return styleEnhance === 'all' ? 'B' : 'A';
}
