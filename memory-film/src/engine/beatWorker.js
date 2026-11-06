// 박자 분석을 별도 스레드에서 (3분 곡 약 0.5초 — 화면이 멈추지 않게)
import { detectBeats } from './beats.js';

self.onmessage = (e) => {
  const { id, pcm, sr } = e.data;
  try {
    self.postMessage({ id, ok: true, ...detectBeats(pcm, sr) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
