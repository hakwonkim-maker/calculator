// Canvas2D 드로잉 헬퍼: 타이포그래피, 금박 그라데이션, 보케 파티클, 배경
import { fontStr } from './presets.js';
import { rng, hashStr, prog, easeOutCubic, clamp } from './math.js';

export function setFont(ctx, spec, size, weight) {
  ctx.font = fontStr(spec, size, weight);
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** 금속 질감 그라데이션 (위→아래) */
export function accentGradient(ctx, theme, y0, y1, x0 = 0, x1 = 0) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const st = theme.accent;
  st.forEach((c, i) => g.addColorStop(i / (st.length - 1), c));
  return g;
}

/** 자간 적용 텍스트 폭 (마지막 글자 뒤 자간 제외) */
export function measureTracked(ctx, text, tracking) {
  ctx.letterSpacing = `${tracking}px`;
  const w = ctx.measureText(text).width;
  ctx.letterSpacing = '0px';
  return Math.max(0, w - (text.length ? tracking : 0));
}

/** 자간 적용 텍스트 (정렬 보정 포함). 반환: 실제 폭 */
export function drawTracked(ctx, text, x, y, tracking = 0, align = 'center', mode = 'fill') {
  if (!text) return 0;
  const w = measureTracked(ctx, text, tracking);
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.letterSpacing = `${tracking}px`;
  ctx.textAlign = 'left';
  if (mode === 'stroke') ctx.strokeText(text, x0, y);
  else ctx.fillText(text, x0, y);
  ctx.letterSpacing = '0px';
  return w;
}

/** 최대 폭을 넘으면 글자 크기를 줄여 맞춤 */
export function fitFontSize(ctx, spec, text, size, maxW, trackingEm = 0, weight) {
  setFont(ctx, spec, size, weight);
  const w = measureTracked(ctx, text, size * trackingEm);
  if (w <= maxW || w === 0) return size;
  return Math.max(8, size * (maxW / w));
}

/**
 * 글자 단위 순차 등장 (한글 타이틀용)
 * 각 글자가 아래에서 살짝 떠오르며 페이드인.
 */
export function drawCharsReveal(ctx, text, cx, y, o) {
  const { t, start, stagger = 0.05, dur = 0.8, rise = 16, tracking = 0, alpha = 1, align = 'center', blur = 0 } = o;
  if (!text) return;
  const chars = Array.from(text);
  const total = measureTracked(ctx, text, tracking);
  const x0 = align === 'center' ? cx - total / 2 : align === 'right' ? cx - total : cx;
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${tracking}px`;
  let prefix = '';
  let idx = 0;
  const baseAlpha = ctx.globalAlpha;
  for (const ch of chars) {
    const xi = x0 + (prefix ? ctx.measureText(prefix).width : 0);
    prefix += ch;
    if (ch.trim() === '') continue;
    const a = easeOutCubic(prog(t, start + idx * stagger, start + idx * stagger + dur));
    idx++;
    if (a <= 0.001) continue;
    // (성능) 글자별 블러 대신 투명도 + 떠오름 + 살짝 커지는 효과
    ctx.globalAlpha = baseAlpha * alpha * a;
    if (blur > 0 && a < 1) {
      const s = 1 + 0.06 * (1 - a);
      ctx.save();
      ctx.translate(xi, y + rise * (1 - a));
      ctx.scale(s, s);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    } else ctx.fillText(ch, xi, y + rise * (1 - a));
  }
  ctx.globalAlpha = baseAlpha;
  ctx.letterSpacing = '0px';
}

// ---------- 성능: 블러는 작은 캔버스에서만 ----------
// 메인 캔버스에 ctx.filter = blur()를 쓰면 화면 전체 크기의 레이어가 생겨 프레임당 수백 ms가 걸린다.
// 대상 영역만 작은 캔버스에 그려 블러한 뒤 붙인다.
const scratchPool = [];
function scratch(i, w, h) {
  let c = scratchPool[i];
  if (!c || c.width < w || c.height < h) {
    c = new OffscreenCanvas(Math.max(w, c?.width || 0), Math.max(h, c?.height || 0));
    scratchPool[i] = c;
  }
  return c;
}

/** (x, y, w, h) 영역에 draw(g)로 그린 내용을 px만큼 흐리게 해서 ctx에 그림 (좌표는 ctx 기준) */
export function withBlur(ctx, px, x, y, w, h, draw) {
  if (!(px > 0.4)) {
    draw(ctx);
    return;
  }
  const pad = Math.ceil(px * 3);
  const cw = Math.ceil(w + pad * 2);
  const ch = Math.ceil(h + pad * 2);
  if (cw <= 0 || ch <= 0) return;
  const A = scratch(0, cw, ch);
  const B = scratch(1, cw, ch);
  const a = A.getContext('2d');
  a.setTransform(1, 0, 0, 1, 0, 0);
  a.clearRect(0, 0, cw, ch);
  a.translate(pad - x, pad - y);
  draw(a);
  const b = B.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0);
  b.clearRect(0, 0, cw, ch);
  b.filter = `blur(${px.toFixed(2)}px)`;
  b.drawImage(A, 0, 0, cw, ch, 0, 0, cw, ch);
  b.filter = 'none';
  ctx.drawImage(B, 0, 0, cw, ch, x - pad, y - pad, cw, ch);
}

/** 큰 영역 블러: 1/scale로 줄여 블러 후 확대 (블러가 크면 화질 차이 없음) */
export function drawDownBlurred(ctx, src, W, H, px, scale = 4) {
  const w = Math.ceil(W / scale);
  const h = Math.ceil(H / scale);
  const c = scratch(2, w, h);
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.filter = `blur(${(px / scale).toFixed(2)}px)`;
  g.drawImage(src, 0, 0, W, H, 0, 0, w, h);
  g.filter = 'none';
  ctx.drawImage(c, 0, 0, w, h, 0, 0, W, H);
}

/** 공백 제외 글자 수 (순차 등장 총 시간 계산용) */
export function visibleChars(text) {
  return Array.from(text || '').filter((c) => c.trim() !== '').length;
}

// ---------- 보케 / 파티클 ----------
const spriteCache = new Map();
function bokehSprite(color, kind) {
  const key = color + kind;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 128;
  const c = new OffscreenCanvas(S, S);
  const g = c.getContext('2d');
  const [r, gg, b] = hexToRgb(color);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (kind === 'discBlur') {
    // 큰 보케용: 블러를 스프라이트에 미리 구워 둠 (매 프레임 블러 필터 제거)
    const base = bokehSprite(color, 'disc');
    g.filter = 'blur(5px)';
    g.drawImage(base, 8, 8, S - 16, S - 16);
    g.filter = 'none';
    const bm = c.transferToImageBitmap(); // ImageBitmap은 그릴 때 복사 비용이 없음
    spriteCache.set(key, bm);
    return bm;
  }
  if (kind === 'disc') {
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.42)`);
    grad.addColorStop(0.72, `rgba(${r},${gg},${b},0.36)`);
    grad.addColorStop(0.88, `rgba(${r},${gg},${b},0.55)`);
    grad.addColorStop(0.96, `rgba(${r},${gg},${b},0.18)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  } else {
    grad.addColorStop(0, `rgba(255,255,255,1)`);
    grad.addColorStop(0.18, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.22)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const bm = c.transferToImageBitmap();
  spriteCache.set(key, bm);
  return bm;
}

/**
 * 결정적 보케 파티클. 시간 t에 대해 항상 같은 결과.
 * opts: { seed, discs, sparks, color, speed, alpha }
 */
export function drawBokeh(ctx, W, H, t, opts) {
  const { seed = 1, discs = 26, sparks = 60, color = '#f0cf82', speed = 1, alpha = 1, blurDiscs = true } = opts;
  const u = Math.min(W, H) / 1080;
  const r = rng(hashStr('bokeh' + seed));
  const disc = bokehSprite(color, 'disc');
  const discBlur = bokehSprite(color, 'discBlur');
  const spark = bokehSprite(color, 'spark');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < discs; i++) {
    const x0 = r() * W;
    const y0 = r() * H;
    const rad = (30 + Math.pow(r(), 1.6) * 130) * u;
    const vx = (r() - 0.35) * 14 * u * speed;
    const vy = -(6 + r() * 16) * u * speed;
    const ph = r() * Math.PI * 2;
    const tw = 0.3 + r() * 0.6;
    const base = 0.05 + r() * 0.16;
    const x = wrap(x0 + vx * t, -rad, W + rad);
    const y = wrap(y0 + vy * t, -rad, H + rad);
    const a = base * (0.65 + 0.35 * Math.sin(t * tw + ph)) * alpha;
    if (a <= 0.003) continue;
    ctx.globalAlpha = a;
    ctx.drawImage(blurDiscs && rad > 110 * u ? discBlur : disc, x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < sparks; i++) {
    const x0 = r() * W;
    const y0 = r() * H;
    const rad = (4 + r() * 12) * u;
    const vx = (r() - 0.5) * 10 * u * speed;
    const vy = -(8 + r() * 26) * u * speed;
    const ph = r() * Math.PI * 2;
    const tw = 0.8 + r() * 2.2;
    const x = wrap(x0 + vx * t + Math.sin(t * 0.6 + ph) * 12 * u, -rad, W + rad);
    const y = wrap(y0 + vy * t, -rad, H + rad);
    const a = clamp(0.15 + 0.85 * Math.pow(0.5 + 0.5 * Math.sin(t * tw + ph), 3)) * alpha * 0.9;
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    ctx.drawImage(spark, x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

function wrap(v, min, max) {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
}

/** 테마 배경: 중앙이 은은하게 밝은 방사형 그라데이션 + 천천히 움직이는 빛 */
export function drawThemeBackground(ctx, W, H, theme, t = 0, lightAmt = 1) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, theme.bg[1]);
  g.addColorStop(1, theme.bg[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (lightAmt > 0) {
    ctx.save();
    ctx.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
    const lx = W * (0.5 + 0.22 * Math.sin(t * 0.17));
    const ly = H * (0.18 + 0.06 * Math.cos(t * 0.13));
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, H * 0.9);
    lg.addColorStop(0, rgba(theme.particle, (theme.dark ? 0.085 : 0.12) * lightAmt));
    lg.addColorStop(1, rgba(theme.particle, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** 이미지를 사각형에 cover로 그리기 */
export function drawCover(ctx, img, iw, ih, x, y, w, h, zoom = 1, fx = 0.5, fy = 0.5) {
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
}

export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
