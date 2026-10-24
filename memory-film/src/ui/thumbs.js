// 선택 카드용 실제 렌더 썸네일 (인트로·엔딩·템플릿)
// WebGL 컨텍스트 하나를 공유하고 요청을 순서대로 처리한다.
import { useEffect, useState } from 'react';
import { Renderer } from '../engine/renderer.js';

const W = 384;
const H = 216;
let renderer = null;
let chain = Promise.resolve();
const cache = new Map();

function getRenderer() {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    renderer = new Renderer({ canvas, width: W, height: H, assetCapacity: 12 });
  }
  return renderer;
}

function variant(project, kind) {
  const photos = project.items.filter((i) => i.type === 'photo').slice(0, 10);
  const base = { ...project, items: photos, output: { ...project.output, aspect: '16:9' } };
  if (kind === 'intro') return { ...base, outro: { ...project.outro, enabled: false }, intro: { ...project.intro, enabled: true } };
  return { ...base, intro: { ...project.intro, enabled: false }, outro: { ...project.outro, enabled: true } };
}

function keyOf(p, kind) {
  return JSON.stringify([kind, p.intro.style, p.intro.duration, p.outro.style, p.outro.duration, p.style.theme, p.style.typography, p.text, p.items.map((i) => i.path + (i.rotate || ''))]);
}

export function renderThumb(project, kind) {
  const p = variant(project, kind);
  const key = keyOf(p, kind);
  if (cache.has(key)) return cache.get(key);
  const job = (chain = chain.then(async () => {
    const r = getRenderer();
    const tl = r.setProject(p);
    await r.prepareFonts();
    const seg = tl.segments.find((s) => s.type === kind);
    if (!seg) return null;
    let frac = 0.72;
    if (kind === 'outro') frac = p.outro.style === 'credits' ? 0.82 : 0.55;
    const t = seg.start + seg.dur * frac;
    await r.ensureAt(t);
    r.renderSync(t);
    if (r.compositor.isLost()) {
      // GPU 리셋 등: 렌더러를 다시 만들고 이 결과는 캐시하지 않음
      r.dispose();
      renderer = null;
      return null;
    }
    return r.canvas.toDataURL('image/jpeg', 0.86);
  }).catch(() => null));
  cache.set(key, job);
  job.then((u) => {
    if (!u) cache.delete(key);
  });
  if (cache.size > 120) cache.delete(cache.keys().next().value);
  return job;
}

export function useThumb(project, kind) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      renderThumb(project, kind).then((u) => alive && setSrc(u));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [project, kind]);
  return src;
}
