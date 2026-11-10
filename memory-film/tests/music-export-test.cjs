// 직접 편집 음악의 내보내기(FFmpeg) 검증: 실제로 소리를 합성해 시점별 크기를 잰다
// 사용법: node tests/music-export-test.cjs
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildAudio, ffmpegPath } = require('../electron/exporter.cjs');

const ff = ffmpegPath();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-mus-'));
const tone = (name, hz, sec) => {
  const p = path.join(dir, name);
  const r = spawnSync(ff, ['-y', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${sec}:sample_rate=48000`, '-af', 'volume=0.5', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', p]);
  assert.equal(r.status, 0, r.stderr?.toString().slice(-400));
  return p;
};
const A = tone('a.mp3', 440, 20);
const B = tone('b.mp3', 660, 12);
const total = 30;
const music = {
  mode: 'edit',
  volume: 1,
  fadeOut: 2,
  endFade: true,
  tracks: [{ path: A, duration: 20 }, { path: B, duration: 12 }],
  layers: 3,
  muted: [2],
  clips: [
    // A: 영상 0~10초, 원곡 5~15초 구간, 앞 1초 페이드인, 뒤 3초 페이드아웃(교차)
    { id: 'a', path: A, start: 0, in: 5, out: 15, fadeIn: 1, fadeOut: 3, layer: 0 },
    // B: 영상 7~19초 (3초 교차), 레이어 1
    { id: 'b', path: B, start: 7, in: 0, out: 12, fadeIn: 3, fadeOut: 0, layer: 1 },
    // A 다시: 영상 25~45초 (영상 끝 30초에서 잘림) — 19~25초는 무음
    { id: 'c', path: A, start: 25, in: 0, out: 20, fadeIn: 0, fadeOut: 0, layer: 0 },
    // 소리 끈 레이어 2 — 들리면 안 됨
    { id: 'd', path: B, start: 19, in: 0, out: 5, fadeIn: 0, fadeOut: 0, layer: 2 },
  ],
};
const a = buildAudio(music, total);
assert(a, '그래프 생성');
const out = path.join(dir, 'mix.raw');
const r = spawnSync(ff, ['-y', ...a.inputs.flatMap((x) => [x]), '-filter_complex', a.filter.replace(/\[(\d+):a\]/g, (m, k) => `[${k - 1}:a]`), '-map', '[aout]', '-ac', '1', '-ar', '8000', '-f', 's16le', out]);
assert.equal(r.status, 0, r.stderr?.toString().slice(-800));
const buf = fs.readFileSync(out);
const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
const rms = (t0, t1) => {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, Math.floor(t0 * 8000)); i < Math.min(pcm.length, t1 * 8000); i++) {
    s += (pcm[i] / 32768) ** 2;
    n++;
  }
  return Math.sqrt(s / Math.max(1, n));
};
const full = rms(3, 6); // A 혼자, 페이드 없음
const lv = (t) => rms(t - 0.1, t + 0.1) / full;
console.log('길이', (pcm.length / 8000).toFixed(2), '초 · 기준', full.toFixed(3));
assert(Math.abs(pcm.length / 8000 - total) < 0.05, '영상 길이와 같음');
assert(rms(0, 0.1) / full < 0.2, '시작 페이드인: ' + (rms(0, 0.1) / full).toFixed(2));
assert(lv(4) > 0.9, 'A 단독');
assert(lv(8.5) > 0.6 && lv(8.5) < 1.5, '교차 구간 (두 곡이 섞임): ' + lv(8.5).toFixed(2));
assert(lv(14) > 0.85, 'B 단독(페이드인 끝난 뒤): ' + lv(14).toFixed(2));
assert(lv(22) < 0.02, '19~25초 무음 (소리 끈 레이어는 안 들림): ' + lv(22).toFixed(3));
assert(lv(26.5) > 0.85, 'A 다시');
assert(lv(29.5) < 0.6, '영상 끝 페이드아웃: ' + lv(29.5).toFixed(2));
// A 의 원곡 5초 지점부터 쓰는지(주파수 대신 시작 위치: 0~1초 페이드인 구간 이후 바로 소리 있음)
assert(lv(1.5) > 0.9);
// B 의 페이드인: 7초 직후 B 는 아직 작고, A 는 페이드아웃 시작 전이라 거의 A 만 들림
assert(lv(7.1) > 0.85 && lv(7.1) < 1.2, '교차 시작: ' + lv(7.1).toFixed(2));
assert(lv(17) > 0.85, 'B 단독: ' + lv(17).toFixed(2));
console.log('music-export-test: 모두 통과');
fs.rmSync(dir, { recursive: true, force: true });
