// 사진 에셋 관리: 출력 해상도에 맞춘 다운스케일 + 블러 배경 + LRU 캐시
// 원본(2천만 화소급)을 그대로 GPU에 올리면 수백 장에서 메모리가 부족해지므로
// 출력 해상도 × 여유배율 크기로만 보관한다.

import { mediaUrl } from '../platform.js';

/** 사진 아이템 → 캐시 키 (회전 값 포함) */
export function itemKey(it) {
  const r = ((Number(it?.rotate) || 0) % 360 + 360) % 360;
  return r ? `${it.path}#r${r}` : it?.path;
}

function splitKey(key) {
  const m = /^(.*)#r(90|180|270)$/.exec(key);
  return m ? { path: m[1], rot: Number(m[2]) } : { path: key, rot: 0 };
}

/** EXIF 방향이 반영된 비트맵을 추가로 회전 */
async function decodeRotated(key) {
  const { path, rot } = splitKey(key);
  const res = await fetch(mediaUrl(path));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const full = await createImageBitmap(await res.blob(), { imageOrientation: 'from-image' });
  if (!rot) return full;
  const swap = rot === 90 || rot === 270;
  const c = new OffscreenCanvas(swap ? full.height : full.width, swap ? full.width : full.height);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate((rot * Math.PI) / 180);
  g.drawImage(full, -full.width / 2, -full.height / 2);
  full.close();
  return createImageBitmap(c);
}

export class AssetManager {
  constructor({ width, height, capacity = 14 }) {
    this.W = width;
    this.H = height;
    this.capacity = capacity;
    this.cache = new Map(); // key -> {promise, asset, used}
    this.thumbCache = new Map();
    this.thumbSize = Math.round(Math.max(360, width * 0.28));
  }

  _touch(entry) {
    entry.used = performance.now();
  }

  get(path) {
    const e = this.cache.get(path);
    if (e && e.asset) {
      this._touch(e);
      return e.asset;
    }
    return null;
  }

  getThumb(path) {
    const e = this.thumbCache.get(path);
    return e && e.asset ? e.asset : null;
  }

  load(path) {
    let e = this.cache.get(path);
    if (!e) {
      e = { promise: null, asset: null, used: performance.now() };
      e.promise = this._decode(path)
        .then((a) => (e.asset = a))
        .catch((err) => {
          console.warn('사진 로드 실패', path, err);
          e.asset = { failed: true, w: 16, h: 9 };
          return e.asset;
        });
      this.cache.set(path, e);
      this._evict();
    }
    this._touch(e);
    return e.promise;
  }

  loadThumb(path) {
    let e = this.thumbCache.get(path);
    if (!e) {
      e = { promise: null, asset: null };
      e.promise = this._decodeThumb(path)
        .then((a) => (e.asset = a))
        .catch(() => (e.asset = { failed: true, w: 16, h: 9 }));
      this.thumbCache.set(path, e);
    }
    return e.promise;
  }

  async ensure(paths, thumbs = []) {
    await Promise.all([...paths.map((p) => this.load(p)), ...thumbs.map((p) => this.loadThumb(p))]);
  }

  isReady(paths, thumbs = []) {
    return paths.every((p) => this.cache.get(p)?.asset) && thumbs.every((p) => this.thumbCache.get(p)?.asset);
  }

  _evict() {
    if (this.cache.size <= this.capacity) return;
    const entries = [...this.cache.entries()].filter(([, e]) => e.asset).sort((a, b) => a[1].used - b[1].used);
    while (this.cache.size > this.capacity && entries.length) {
      const [k, e] = entries.shift();
      e.asset?.img?.close?.();
      e.asset?.bg?.close?.();
      this.cache.delete(k);
    }
  }

  async _decode(key) {
    const full = await decodeRotated(key);
    const iw = full.width;
    const ih = full.height;
    // 켄번스 줌(최대 ~1.3배)까지 고려한 최대 보관 크기
    const cover = Math.max(this.W / iw, this.H / ih) * 1.35;
    const scale = Math.min(1, cover);
    const tw = Math.max(1, Math.round(iw * scale));
    const th = Math.max(1, Math.round(ih * scale));
    const img = scale < 1 ? await createImageBitmap(full, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' }) : full;

    // 블러 배경: 작은 캔버스에서 블러 → 크게 늘려 그려도 매끈함
    const bw = 360;
    const bh = Math.round((bw * this.H) / this.W);
    const c = new OffscreenCanvas(bw, bh);
    const g = c.getContext('2d');
    const s = Math.max(bw / iw, bh / ih) * 1.15;
    g.filter = 'blur(14px) saturate(1.15)';
    g.drawImage(full, (bw - iw * s) / 2, (bh - ih * s) / 2, iw * s, ih * s);
    g.filter = 'none';
    const bg = await createImageBitmap(c);
    if (img !== full) full.close();
    return { img, bg, w: tw, h: th, srcW: iw, srcH: ih };
  }

  async _decodeThumb(key) {
    const full = await decodeRotated(key);
    const s = Math.min(1, this.thumbSize / Math.max(full.width, full.height));
    const tw = Math.max(1, Math.round(full.width * s));
    const th = Math.max(1, Math.round(full.height * s));
    const img = await createImageBitmap(full, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' });
    full.close();
    return { img, w: tw, h: th };
  }

  dispose() {
    for (const e of this.cache.values()) {
      e.asset?.img?.close?.();
      e.asset?.bg?.close?.();
    }
    for (const e of this.thumbCache.values()) e.asset?.img?.close?.();
    this.cache.clear();
    this.thumbCache.clear();
  }
}

/** UI 필름스트립용 썸네일 (blob URL) — 동시 디코딩 수 제한 */
const thumbQueue = [];
let thumbActive = 0;
const thumbUrlCache = new Map();

export function uiThumb(path, size = 240, rotate = 0) {
  const ak = itemKey({ path, rotate });
  const key = ak + '|' + size;
  if (thumbUrlCache.has(key)) return thumbUrlCache.get(key);
  const p = new Promise((resolve) => {
    thumbQueue.push(async () => {
      try {
        const full = await decodeRotated(ak);
        const s = Math.min(1, size / Math.min(full.width, full.height));
        const w = Math.round(full.width * s);
        const h = Math.round(full.height * s);
        const c = new OffscreenCanvas(w, h);
        c.getContext('2d').drawImage(full, 0, 0, w, h);
        const info = { w: full.width, h: full.height };
        full.close();
        const out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
        resolve({ url: URL.createObjectURL(out), ...info });
      } catch (e) {
        resolve({ url: null, error: String(e), w: 0, h: 0 });
      }
    });
    pump();
  });
  thumbUrlCache.set(key, p);
  return p;
}

function pump() {
  while (thumbActive < 3 && thumbQueue.length) {
    const job = thumbQueue.shift();
    thumbActive++;
    job().finally(() => {
      thumbActive--;
      pump();
    });
  }
}
