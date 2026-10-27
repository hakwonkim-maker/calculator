// 박자 분석 단위 테스트: node tests/beats-test.mjs
import assert from 'node:assert';
import { detectBeats, beatsOnTimeline } from '../src/engine/beats.js';

const sr = 44100;
function synth(bpm, sec, { offset = 0.37, swing = 0, noise = 0.05, hats = true, seed = 1 } = {}) {
  const x = new Float32Array(sr * sec);
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < x.length; i++) x[i] = rnd() * noise + 0.1 * Math.sin((2 * Math.PI * 220 * i) / sr); // 배경 패드
  const P = 60 / bpm;
  const hit = (t, amp, f, decay) => {
    const i0 = Math.round(t * sr);
    for (let k = 0; k < sr * 0.25 && i0 + k < x.length; k++) x[i0 + k] += amp * Math.exp(-k / (sr * decay)) * Math.sin((2 * Math.PI * f * k) / sr);
  };
  const truth = [];
  for (let t = offset, n = 0; t < sec - 0.3; t += P, n++) {
    truth.push(t);
    hit(t, n % 4 === 0 ? 1 : 0.6, 60, 0.08); // 킥
    if (hats) hit(t + P / 2 + swing, 0.25, 6000, 0.01); // 엇박 하이햇
  }
  return { x, truth };
}
const err = (beats, truth) => {
  // 각 실제 박자에서 가장 가까운 검출 박자까지 거리의 중앙값(초)
  const d = truth.slice(2, -2).map((t) => Math.min(...beats.map((b) => Math.abs(b - t)))).sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
};
for (const bpm of [72, 100, 128, 150]) {
  const { x, truth } = synth(bpm, 40);
  const t0 = Date.now();
  const r = detectBeats(x, sr);
  const e = err(r.beats, truth);
  console.log(`${bpm} BPM → ${r.bpm} BPM, 신뢰도 ${r.confidence}, 박자 ${r.beats.length}개, 오차 중앙값 ${(e * 1000).toFixed(0)}ms, ${Date.now() - t0}ms`);
  const ratio = r.bpm / bpm;
  assert(Math.abs(ratio - 1) < 0.04 || Math.abs(ratio - 2) < 0.08 || Math.abs(ratio - 0.5) < 0.04, 'BPM (배수 허용)');
  assert(e < 0.02, '박자 위치 오차 20ms 이내');
}
// 3분 곡 처리 시간
{
  const { x } = synth(110, 180);
  const t0 = Date.now();
  detectBeats(x, sr);
  const ms = Date.now() - t0;
  console.log('3분 곡 분석', ms, 'ms');
  assert(ms < 8000);
}
// 타임라인 배치: 두 곡 + 크로스페이드 3초
{
  const music = { crossfade: 3, loop: false, tracks: [{ duration: 20, beats: [0.5, 10.5, 18.9, 19.5], beatStrength: [1, 1, 1, 1] }, { duration: 20, beats: [0.2, 1.0, 5] }] };
  const tl = beatsOnTimeline(music, 60).map((b) => b.t);
  console.log('타임라인 박자', tl.join(', '));
  assert.deepEqual(tl, [0.5, 10.5, 22], '크로스페이드 구간 중복 제거 + 두 번째 곡은 17초부터');
}
// 타임라인: 전환 한가운데가 박자에 맞는지
{
  const { buildTimeline } = await import('../src/engine/timeline.js');
  const { defaultProject } = await import('../src/engine/presets.js');
  const p = defaultProject();
  p.items = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, type: 'photo', path: '/r/a' + i + '.jpg', w: 4000, h: 3000 }));
  const beats = [];
  const strength = [];
  for (let t = 0.21; t < 200; t += 0.6) {
    beats.push(+t.toFixed(3));
    strength.push(beats.length % 4 === 1 ? 1 : 0.4);
  }
  p.music.tracks = [{ path: 'm.m4a', duration: 200, beats, beatStrength: strength }];
  p.style.lengthMode = 'total';
  p.style.targetDuration = 120;
  const tl = buildTimeline(p);
  const off = p.style.beatSync === false;
  const cuts = tl.segments.slice(1).map((s) => s.start + s.tIn / 2);
  const dist = cuts.map((c) => Math.min(...beats.map((b) => Math.abs(b - c))));
  const onBeat = dist.filter((d) => d < 0.01).length;
  console.log(`박자 맞춤: 전환 ${cuts.length}개 중 ${onBeat}개가 박자 위 (synced=${tl.beatSynced}), 전체 ${tl.total.toFixed(2)}초`);
  assert(onBeat >= cuts.length * 0.9, '전환의 90% 이상이 박자 위');
  assert(Math.abs(tl.total - 120) < 0.05, '전체 길이 유지');
  for (const s of tl.segments) assert(s.dur >= s.tIn + s.tOut + 0.5, '장면 최소 길이');
  // 센 박자 선호: 맞춘 박자 중 센 박자 비율이 무작위(25%)보다 높아야
  const strong = cuts.filter((c) => { const k = beats.findIndex((b) => Math.abs(b - c) < 0.01); return k >= 0 && strength[k] === 1; }).length;
  console.log('센 박자에 맞춘 전환', strong, '/', onBeat);
  assert(strong / onBeat > 0.4, '센 박자 선호');
  // 끄면 그대로
  const p2 = { ...p, style: { ...p.style, beatSync: false } };
  assert(!buildTimeline(p2).beatSynced, '끄기');
}
console.log('모두 통과');
