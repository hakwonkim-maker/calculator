// 옛 사진 보정 단위 테스트: node tests/enhance-test.mjs
import assert from 'node:assert';
import { toneStats, looksOld, makeCurves, applyCurves, decide } from '../src/engine/enhance.js';

const W = 320;
const H = 240;
// 자연 사진 비슷한 원본: 하늘 그라데이션 + 땅 + 여러 색의 사람 형태 + 어두운 그림자
function original(seed = 1) {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const d = new Uint8ClampedArray(W * H * 4);
  const shapes = Array.from({ length: 9 }, () => ({ x: rnd() * W, y: H * 0.4 + rnd() * H * 0.4, rw: 12 + rnd() * 20, rh: 40 + rnd() * 50, c: [rnd() * 255, rnd() * 255, rnd() * 255] }));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c = y < H * 0.5 ? [70 + y * 0.8, 130 + y * 0.5, 230 - y * 0.2] : [60, 110 - (y - H / 2) * 0.3, 40];
      for (const s of shapes) if (Math.abs(x - s.x) < s.rw / 2 && y > s.y && y < s.y + s.rh) c = s.c;
      if (x < 30 && y > H * 0.6) c = [12, 10, 9]; // 깊은 그림자
      if (x > W - 25 && y < 30) c = [250, 248, 240]; // 밝은 하이라이트
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  return d;
}
// 세월에 바랜 인화 사진: 대비 감소 + 누렇게 변색 + 채도 감소
function aged(src) {
  const d = new Uint8ClampedArray(src);
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const s = (v) => l + (v - l) * 0.55; // 채도 감소
    d[i] = 55 + s(d[i]) * 0.66;
    d[i + 1] = 45 + s(d[i + 1]) * 0.6;
    d[i + 2] = 25 + s(d[i + 2]) * 0.48;
  }
  return d;
}
const mae = (a, b) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return s / n;
};

for (const seed of [1, 2, 3]) {
  const o = original(seed);
  const a = aged(o);
  const sa = toneStats(a);
  const so = toneStats(o);
  assert(looksOld(sa), '바랜 사진을 옛 사진으로 인식');
  assert(!looksOld(so), '정상 사진은 옛 사진으로 보지 않음');
  assert.equal(decide(so, 'A'), null, '정책 A: 정상 사진은 그대로');
  const fixed = applyCurves(new Uint8ClampedArray(a), makeCurves(sa, 'restore'));
  const before = mae(a, o);
  const after = mae(fixed, o);
  const sf = toneStats(fixed);
  console.log(`seed ${seed}: 원본과 차이 ${before.toFixed(1)} → ${after.toFixed(1)} · 색 틀어짐 ${(sa.cast * 100).toFixed(1)}% → ${(sf.cast * 100).toFixed(1)}% · 밝기 범위 ${sa.hiL - sa.loL} → ${sf.hiL - sf.loL} · 채도 ${sa.sat.toFixed(2)} → ${sf.sat.toFixed(2)}`);
  assert(after < before * 0.6, '보정 후 원본에 훨씬 가까워짐');
  // 색 균형(채널 평균)이 원본 쪽으로 돌아왔는지: 변색으로 생긴 차이가 절반 이하로
  const drift = (st) => Math.max(...[0, 1, 2].map((c) => Math.abs(st.mean[c] - so.mean[c])));
  assert(drift(sf) < drift(sa) * 0.5, `색 균형 복원 ${drift(sa).toFixed(1)} → ${drift(sf).toFixed(1)}`);
  assert(sf.hiL - sf.loL > 220, '대비 복원');
  // 정상 사진에 'gentle'을 적용해도 거의 안 바뀜
  const g = applyCurves(new Uint8ClampedArray(o), makeCurves(so, 'gentle'));
  assert(mae(g, o) < 12, '정상 사진은 살짝만: ' + mae(g, o).toFixed(1));
}
// 흑백 스캔(누렇게 변한 흑백) → 중성 회색 쪽으로, 채도 과장 없음
{
  const o = original(5);
  for (let i = 0; i < o.length; i += 4) {
    const l = 0.299 * o[i] + 0.587 * o[i + 1] + 0.114 * o[i + 2];
    o[i] = 40 + l * 0.7 * 1.0;
    o[i + 1] = 35 + l * 0.7 * 0.93;
    o[i + 2] = 25 + l * 0.7 * 0.78;
  }
  const st = toneStats(o);
  const f = applyCurves(new Uint8ClampedArray(o), makeCurves(st, 'restore'));
  const sf = toneStats(f);
  console.log(`누런 흑백: 채도 ${st.sat.toFixed(2)} → ${sf.sat.toFixed(2)}, 범위 ${st.hiL - st.loL} → ${sf.hiL - sf.loL}`);
  assert(looksOld(st));
  assert(sf.sat <= st.sat + 0.02, '흑백 사진 채도를 키우지 않음');
  assert(sf.hiL - sf.loL > 200);
}
console.log('모두 통과');
