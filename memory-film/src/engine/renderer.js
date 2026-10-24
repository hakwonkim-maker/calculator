// 렌더러: 시간 t → 한 프레임
// 장면(Canvas2D) 2장을 그려 WebGL 전환 셰이더로 합성한다.
// 미리보기와 내보내기가 같은 코드를 쓰므로 결과가 동일하다.

import { Compositor } from './compositor.js';
import { AssetManager, itemKey } from './assets.js';
import { buildTimeline, activeAt } from './timeline.js';
import { drawSegment, lookAmountFor, captionAccent } from './scenes.js';
import { THEMES, TYPOGRAPHY, LOOKS } from './presets.js';
import { TRANSITIONS } from './transitions.js';
import { ensureFonts } from './fonts.js';

/** 작은 LRU 캐시 (텍스트·그림자 등 미리 그린 이미지 재사용) */
class LRU {
  constructor(max) {
    this.max = max;
    this.m = new Map();
  }
  get size() {
    return this.m.size;
  }
  get(k) {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k, v) {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value);
  }
  clear() {
    this.m.clear();
  }
}

export class Renderer {
  constructor({ canvas, width, height, assetCapacity }) {
    this.W = width;
    this.H = height;
    canvas.width = width;
    canvas.height = height;
    this.canvas = canvas;
    this.compositor = new Compositor(canvas);
    this.assets = new AssetManager({ width, height, capacity: assetCapacity || 14 });
    const mk = () => {
      const c = new OffscreenCanvas(width, height);
      return [c, c.getContext('2d', { alpha: false })];
    };
    [this.sceneA, this.ctxA] = mk();
    [this.sceneB, this.ctxB] = mk();
    this.layer = new OffscreenCanvas(width, height);
    this.layerCtx = this.layer.getContext('2d');
    this.numLayer = new OffscreenCanvas(width, height);
    this.numLayerCtx = this.numLayer.getContext('2d');
    this.project = null;
    this.tl = null;
  }

  setProject(project) {
    this.project = project;
    this.assets.setHints(project.items);
    this.tl = buildTimeline(project);
    const theme = THEMES[project.style.theme] || THEMES.noir;
    const ca = captionAccent(theme);
    this.env = {
      W: this.W,
      H: this.H,
      u: Math.min(this.W, this.H) / 1080,
      oy: (this.H - 1080 * (Math.min(this.W, this.H) / 1080)) / 2,
      theme,
      typo: TYPOGRAPHY[project.style.typography] || TYPOGRAPHY.classic,
      project,
      assets: this.assets,
      tl: this.tl,
      layer: this.layer,
      layerCtx: this.layerCtx,
      numLayer: this.numLayer,
      numLayerCtx: this.numLayerCtx,
      cache: this.cache || (this.cache = new LRU(40)),
      darkAccent: ca.accent,
      darkAccentSolid: ca.solid,
    };
    return this.tl;
  }

  get duration() {
    return this.tl ? this.tl.total : 0;
  }

  /** 셰이더 미리 컴파일. onlyUsed: 이 영상에 실제로 쓰이는 전환만 (내보내기 시작 시간 단축) */
  warmup(onlyUsed = false) {
    const ids = onlyUsed ? ['none', ...new Set(this.tl.segments.map((s) => s.transIn).filter(Boolean))] : Object.keys(TRANSITIONS);
    return this.compositor.warmup(ids);
  }

  prepareFonts() {
    return ensureFonts(this.project);
  }

  /** 세그먼트를 그리는 데 필요한 에셋 목록 */
  needsFor(seg) {
    const full = [];
    const thumbs = [];
    if (!seg) return { full, thumbs };
    const logo = this.project.text.logo;
    const gallery = () => thumbs.push(...this.tl.gallery.map(itemKey));
    if (seg.type === 'photo') full.push(itemKey(seg.item));
    else if (seg.type === 'chapter' && seg.nextPhoto) full.push(itemKey(seg.nextPhoto));
    if ((seg.type === 'photo' || seg.type === 'chapter') && logo && this.project.style.watermark) thumbs.push(logo);
    if (seg.type === 'intro' || seg.type === 'outro') {
      if (logo) thumbs.push(logo);
      const st = this.project.intro.style;
      if (seg.type === 'intro' && (st === 'mosaic' || st === 'polaroid')) gallery();
      if (seg.type === 'intro' && st === 'cinematic' && this.tl.gallery[0]) full.push(itemKey(this.tl.gallery[0]));
      if (seg.type === 'outro' && this.project.outro.style === 'gallery') gallery();
    }
    return { full, thumbs };
  }

  needsAt(t, lookahead = 0) {
    const full = new Set();
    const thumbs = new Set();
    const act = activeAt(this.tl, t);
    if (!act) return { full: [], thumbs: [] };
    const segs = [act.from, act.to].filter(Boolean);
    if (lookahead > 0) {
      const i = act.from.index;
      for (let k = 1; k <= lookahead; k++) {
        const s = this.tl.segments[i + k];
        if (s) segs.push(s);
      }
    }
    for (const s of segs) {
      const n = this.needsFor(s);
      n.full.forEach((p) => full.add(p));
      n.thumbs.forEach((p) => thumbs.add(p));
    }
    return { full: [...full], thumbs: [...thumbs] };
  }

  async ensureAt(t, lookahead = 0) {
    const n = this.needsAt(t, lookahead);
    await this.assets.ensure(n.full, n.thumbs);
  }

  isReadyAt(t) {
    const n = this.needsAt(t, 0);
    return this.assets.isReady(n.full, n.thumbs);
  }

  /** 동기 렌더 (에셋이 준비되지 않았으면 있는 것만으로 그림) */
  renderSync(t) {
    const tl = this.tl;
    const st = this.project.style;
    const look = LOOKS[st.look] || LOOKS.natural;
    if (!tl || !tl.segments.length) {
      this.ctxA.fillStyle = (THEMES[st.theme] || THEMES.noir).bg[0];
      this.ctxA.fillRect(0, 0, this.W, this.H);
      this.compositor.upload('from', this.sceneA);
      this.compositor.draw({ transition: 'none', progress: 0, time: t, fromLook: 0, toLook: 0, look, vignette: 0, grain: 0 });
      return;
    }
    const act = activeAt(tl, t);
    const mips = !!act.to && this.compositor.needsMips(act.transition);
    drawSegment(this.ctxA, act.from, t - act.from.start, this.env);
    this.compositor.upload('from', this.sceneA, mips);
    if (act.to) {
      drawSegment(this.ctxB, act.to, t - act.to.start, this.env);
      this.compositor.upload('to', this.sceneB, mips);
    }
    this.compositor.draw({
      transition: act.to ? act.transition : 'none',
      progress: act.p,
      time: t,
      fromLook: lookAmountFor(act.from),
      toLook: lookAmountFor(act.to),
      look,
      vignette: Number(st.vignette) || 0,
      grain: Number(st.grain) || 0,
    });
  }

  /** 현재 프레임에 필요한 에셋만 기다리고, 다음 장면은 백그라운드로 미리 로드 */
  async renderAt(t, lookahead = 0) {
    await this.ensureAt(t, 0);
    if (lookahead > 0) this.ensureAt(t, lookahead).catch(() => {});
    this.renderSync(t);
  }

  /** 미리보기 재생용: 준비 안 된 에셋은 로드만 걸어두고 즉시 그림 */
  renderPreview(t) {
    this.ensureAt(t, 2).catch(() => {});
    this.renderSync(t);
  }

  readPixels(buf) {
    return this.compositor.readPixels(buf);
  }

  dispose() {
    this.assets.dispose();
    this.compositor.dispose();
  }
}
