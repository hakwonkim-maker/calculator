// 사진 화질 점수(q, 0~1): 작은 크기로 디코딩해 선명도(라플라시안 분산)와 노출(밝기·날아간 부분)을 잰다.
// 흔들리거나 초점이 나간 사진, 너무 어둡거나 하얗게 날아간 사진이 자동 선별에서 뒤로 밀린다.
import { decodeRotated, itemKey } from './assets.js';

const W = 160;

export async function analyzePhoto(it) {
  const bmp = await decodeRotated(itemKey(it), W);
  const w = W;
  const h = Math.max(8, Math.round((bmp.height / bmp.width) * W));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const d = g.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  let sum = 0;
  let clip = 0;
  for (let i = 0, p = 0; p < L.length; i += 4, p++) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    L[p] = y;
    sum += y;
    if (y < 6 || y > 249) clip++;
  }
  const mean = sum / L.length;
  let s1 = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const lap = 4 * L[p] - L[p - 1] - L[p + 1] - L[p - w] - L[p + w];
      s1 += lap;
      s2 += lap * lap;
      n++;
    }
  }
  const variance = s2 / n - (s1 / n) ** 2;
  const sharp = Math.min(1, Math.max(0, (Math.log10(variance + 1) - 1.3) / 1.6));
  const expo = Math.max(0, 1 - Math.abs(mean - 125) / 125);
  const clipped = clip / L.length;
  const q = 0.6 * sharp + 0.4 * expo * Math.max(0, 1 - clipped * 1.5);
  return Math.round(q * 1000) / 1000;
}

/** 여러 장 분석 (동시 3장, 진행률 콜백). 실패한 사진은 건너뜀. 반환: Map(id → q) */
export async function analyzePhotos(items, onProgress = () => {}, isCancelled = () => false) {
  const out = new Map();
  const queue = items.slice();
  let done = 0;
  const worker = async () => {
    while (queue.length && !isCancelled()) {
      const it = queue.shift();
      try {
        out.set(it.id, await analyzePhoto(it));
      } catch {
        /* 읽을 수 없는 사진 */
      }
      onProgress(++done, items.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}
