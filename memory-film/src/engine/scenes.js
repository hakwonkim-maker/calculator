// 장면 렌더러: 인트로(3종), 사진(켄번스 + 캡션), 챕터 카드, 아웃트로
// 모든 함수는 (ctx, seg, tau, env) → 시간 tau에 대한 순수 함수 (결정적)
// 크기 단위 u = H/1080 : 1080p 기준 픽셀로 디자인하고 해상도에 비례해 확대/축소

import {
  setFont, rgba, accentGradient, drawTracked, measureTracked, fitFontSize,
  drawCharsReveal, visibleChars, drawBokeh, drawThemeBackground, drawCover, hexToRgb,
} from './draw.js';
import { prog, clamp, lerp, easeOutCubic, easeInOutSine, easeOutQuart, easeInOutCubic, inOut, rng, hashStr } from './math.js';

export function drawSegment(ctx, seg, tau, env) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.textBaseline = 'alphabetic';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  switch (seg.type) {
    case 'intro':
      drawIntro(ctx, seg, tau, env);
      break;
    case 'photo':
      drawPhoto(ctx, seg, tau, env);
      break;
    case 'chapter':
      drawChapter(ctx, seg, tau, env);
      break;
    case 'outro':
      drawOutro(ctx, seg, tau, env);
      break;
    default:
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, env.W, env.H);
  }
  ctx.restore();
}

/** 색보정(룩) 적용 정도: 사진 장면만 1 */
export function lookAmountFor(seg) {
  if (!seg) return 0;
  if (seg.type === 'photo') return 1;
  if (seg.type === 'chapter') return 0.35;
  return 0;
}

// =====================================================================
// 공통: 타이틀 락업 (숫자 · ANNIVERSARY · 제목 · 연도 · 기관명 · 로고)
// =====================================================================
function drawLockup(ctx, env, tau, s, k, opts = {}) {
  const { W, H, u, theme, typo, project } = env;
  const tx = project.text;
  const cx = W / 2;
  const T = (x) => s + x * k;
  const onPhoto = !!opts.onPhoto;
  const textColor = opts.textColor || theme.text;
  const hasNum = !!(tx.number && tx.number.trim());
  const logo = tx.logo ? env.assets.getThumb(tx.logo) : null;

  const Y = hasNum
    ? { num: 478, eye: 572, title: 692, sub: 764, org: 842, logo: 942 }
    : { num: 0, eye: 392, title: 520, sub: 600, org: 680, logo: 790 };
  if (!tx.org && logo && !logo.failed) Y.logo = Y.org + 30;

  if (onPhoto) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 28 * u;
  }

  // ---- 큰 숫자 (블러에서 선명하게 + 금박 광택 스윕)
  if (hasNum) {
    const a = easeOutCubic(prog(tau, T(0), T(1.7)));
    if (a > 0.001) {
      const L = env.numLayerCtx;
      const size = fitFontSize(L, typo.display, tx.number, 330 * u, W * 0.8, 0.02);
      setFont(L, typo.display, size);
      L.textBaseline = 'alphabetic';
      const m = L.measureText(tx.number);
      const asc = m.actualBoundingBoxAscent;
      const desc = m.actualBoundingBoxDescent;
      const y = Y.num * u;
      const tw = measureTracked(L, tx.number, size * 0.02);
      const pad = 90 * u;
      const rx = Math.max(0, cx - tw / 2 - pad);
      const ry = Math.max(0, y - asc - pad);
      const rw = Math.min(W - rx, tw + pad * 2);
      const rh = Math.min(env.H - ry, asc + desc + pad * 2);
      L.clearRect(0, 0, W, env.H);
      L.save();
      L.shadowColor = rgba(theme.particle, theme.dark ? 0.42 : 0.28);
      L.shadowBlur = 46 * u;
      L.fillStyle = accentGradient(L, theme, y - asc, y + desc);
      drawTracked(L, tx.number, cx, y, size * 0.02);
      L.restore();
      const sp = prog(tau, T(1.9), T(3.4));
      if (sp > 0 && sp < 1) {
        L.save();
        L.globalCompositeOperation = 'source-atop';
        const bx = lerp(cx - tw / 2 - 260 * u, cx + tw / 2 + 260 * u, easeInOutSine(sp));
        L.translate(bx, y - asc / 2);
        L.transform(1, 0, -0.35, 1, 0, 0);
        const g = L.createLinearGradient(-110 * u, 0, 110 * u, 0);
        g.addColorStop(0, 'rgba(255,252,235,0)');
        g.addColorStop(0.5, 'rgba(255,252,235,0.85)');
        g.addColorStop(1, 'rgba(255,252,235,0)');
        L.fillStyle = g;
        L.fillRect(-110 * u, -asc, 220 * u, asc * 2 + desc);
        L.restore();
      }
      const sc = 1.14 - 0.14 * easeOutQuart(prog(tau, T(0), T(2.8)));
      const blur = 28 * u * (1 - easeOutCubic(prog(tau, T(0), T(1.9))));
      const ccy = y - asc / 2;
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = a;
      ctx.translate(cx, ccy);
      ctx.scale(sc, sc);
      ctx.translate(-cx, -ccy);
      if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(2)}px)`;
      ctx.drawImage(env.numLayer, rx, ry, rw, rh, rx, ry, rw, rh);
      ctx.restore();
    }
  }

  // ---- ANNIVERSARY 라인 + 아이브로우
  if (tx.eyebrow) {
    const size = fitFontSize(ctx, typo.eyebrow, tx.eyebrow, 34 * u, W * 0.6, 0.42);
    const a = easeOutCubic(prog(tau, T(1.3), T(2.4)));
    const trk = size * lerp(0.85, 0.42, easeOutQuart(prog(tau, T(1.3), T(2.8))));
    setFont(ctx, typo.eyebrow, size);
    const w = measureTracked(ctx, tx.eyebrow, size * 0.42);
    const y = Y.eye * u;
    const lg = easeInOutCubic(prog(tau, T(1.2), T(2.6)));
    if (lg > 0) {
      const gap = 34 * u;
      const len = 120 * u * lg;
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 0.85 * lg;
      ctx.fillStyle = theme.accentSolid;
      const ly = y - size * 0.33;
      ctx.fillRect(cx - w / 2 - gap - len, ly, len, Math.max(1, 1.6 * u));
      ctx.fillRect(cx + w / 2 + gap, ly, len, Math.max(1, 1.6 * u));
      ctx.beginPath();
      const d = 4.5 * u * lg;
      for (const sx of [cx - w / 2 - gap - len - 10 * u, cx + w / 2 + gap + len + 10 * u]) {
        ctx.moveTo(sx, ly + 0.8 * u - d);
        ctx.lineTo(sx + d, ly + 0.8 * u);
        ctx.lineTo(sx, ly + 0.8 * u + d);
        ctx.lineTo(sx - d, ly + 0.8 * u);
      }
      ctx.fill();
      ctx.restore();
    }
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = accentGradient(ctx, theme, y - size, y + size * 0.2);
      drawTracked(ctx, tx.eyebrow, cx, y, trk);
      ctx.restore();
    }
  }

  // ---- 한글 타이틀: 글자 단위 순차 등장
  if (tx.title) {
    const base = hasNum ? 76 : 98;
    const size = fitFontSize(ctx, typo.title, tx.title, base * u, W * 0.84, 0.02);
    setFont(ctx, typo.title, size);
    ctx.fillStyle = opts.titleGold ? accentGradient(ctx, theme, Y.title * u - size, Y.title * u + size * 0.2) : textColor;
    const stagger = Math.min(0.065, 1.1 / Math.max(1, visibleChars(tx.title)));
    drawCharsReveal(ctx, tx.title, cx, Y.title * u, {
      t: tau, start: T(2.3), stagger: stagger * k, dur: 0.95 * k, rise: 22 * u, tracking: size * 0.02, blur: 6 * u,
    });
  }

  // ---- 연도 서브타이틀
  if (tx.subtitle) {
    const a = easeOutCubic(prog(tau, T(3.2), T(4.3)));
    if (a > 0) {
      const size = fitFontSize(ctx, typo.display, tx.subtitle, 34 * u, W * 0.7, 0.28);
      setFont(ctx, typo.display, size, Math.min(600, typo.display.weight + (typo.display.weight < 400 ? 200 : 0)));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = theme.accentSolid;
      drawTracked(ctx, tx.subtitle, cx, Y.sub * u + (1 - a) * 10 * u, size * lerp(0.5, 0.28, easeOutQuart(a)));
      ctx.restore();
    }
  }

  // ---- 기관명 + 로고
  const ao = easeOutCubic(prog(tau, T(3.7), T(4.9)));
  if (ao > 0) {
    if (tx.org) {
      const size = fitFontSize(ctx, typo.body, tx.org, 30 * u, W * 0.7, 0.12);
      setFont(ctx, typo.body, size);
      ctx.save();
      ctx.globalAlpha = ao;
      ctx.fillStyle = opts.textDim || theme.textDim;
      drawTracked(ctx, tx.org, cx, Y.org * u + (1 - ao) * 12 * u, size * 0.12);
      ctx.restore();
    }
    if (logo && !logo.failed) {
      const lh = 72 * u;
      const lw = Math.min(W * 0.3, (logo.w / logo.h) * lh);
      const lhh = (lw / logo.w) * logo.h;
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = ao;
      ctx.drawImage(logo.img, cx - lw / 2, Y.logo * u - lhh / 2, lw, lhh);
      ctx.restore();
    }
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/** 인트로 길이에 맞춰 애니메이션 속도 조절 */
const introK = (dur) => clamp((dur - 2.4) / 7.6, 0.55, 1.5);

// =====================================================================
// 인트로
// =====================================================================
function drawIntro(ctx, seg, tau, env) {
  const style = env.project.intro.style;
  if (style === 'mosaic') drawIntroMosaic(ctx, seg, tau, env);
  else if (style === 'light') drawIntroCounter(ctx, seg, tau, env);
  else drawIntroGolden(ctx, seg, tau, env);
}

function drawRays(ctx, env, t, alpha) {
  const { W, H, u, theme } = env;
  if (!env._raySprite) {
    const c = new OffscreenCanvas(96, 512);
    const g = c.getContext('2d');
    const hg = g.createLinearGradient(0, 0, 96, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)');
    hg.addColorStop(0.5, 'rgba(255,255,255,1)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, 96, 512);
    g.globalCompositeOperation = 'destination-in';
    const vg = g.createLinearGradient(0, 0, 0, 512);
    vg.addColorStop(0, 'rgba(0,0,0,1)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, 96, 512);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = theme.particle;
    g.fillRect(0, 0, 96, 512);
    env._raySprite = c;
  }
  ctx.save();
  ctx.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
  const ox = W * 0.5;
  const oy = -H * 0.12;
  const rays = [
    [-0.55, 220, 0.07], [-0.3, 140, 0.05], [-0.08, 260, 0.06], [0.15, 160, 0.05], [0.38, 240, 0.065], [0.6, 150, 0.045],
  ];
  rays.forEach(([ang, w, a], i) => {
    const an = ang + 0.06 * Math.sin(t * 0.21 + i * 1.7);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(an);
    ctx.globalAlpha = a * alpha * (0.7 + 0.3 * Math.sin(t * 0.5 + i));
    ctx.drawImage(env._raySprite, (-w / 2) * u, 0, w * u, H * 1.45);
    ctx.restore();
  });
  ctx.restore();
}

function blackFadeIn(ctx, env, tau, d = 1.4) {
  const f = 1 - easeInOutSine(prog(tau, 0, d));
  if (f > 0.001) {
    ctx.save();
    ctx.globalAlpha = f;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, env.W, env.H);
    ctx.restore();
  }
}

function pushIn(ctx, env, tau, dur, amt = 0.04) {
  const s = 1 + amt * easeInOutSine(clamp(tau / dur));
  ctx.translate(env.W / 2, env.H / 2);
  ctx.scale(s, s);
  ctx.translate(-env.W / 2, -env.H / 2);
}

function drawIntroGolden(ctx, seg, tau, env) {
  const { W, H, theme } = env;
  const k = introK(seg.dur);
  drawThemeBackground(ctx, W, H, theme, tau, 1.3);
  drawRays(ctx, env, tau, easeOutCubic(prog(tau, 0.2, 3)));
  drawBokeh(ctx, W, H, tau + 4, { seed: 'gold', discs: 30, sparks: 70, color: theme.particle, alpha: easeOutCubic(prog(tau, 0, 2.6)) * (theme.dark ? 1 : 0.6) });
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.035);
  drawLockup(ctx, env, tau, 0.5 * k, k);
  ctx.restore();
  blackFadeIn(ctx, env, tau, 1.2);
}

function drawIntroMosaic(ctx, seg, tau, env) {
  const { W, H, u, theme, tl } = env;
  const k = introK(seg.dur);
  ctx.fillStyle = theme.bg[0];
  ctx.fillRect(0, 0, W, H);
  const photos = tl.gallery;
  const L = env.layerCtx;
  L.clearRect(0, 0, W, H);
  L.save();
  const cols = 7;
  const rows = 5;
  const th = H * 0.29;
  const tw = th * 1.38;
  const gap = 14 * u;
  const bw = cols * (tw + gap);
  const bh = rows * (th + gap);
  const p = clamp(tau / seg.dur);
  L.translate(W / 2 + lerp(60, -60, p) * u, H / 2 + lerp(20, -20, p) * u);
  L.rotate(-0.12);
  const sc = lerp(1.22, 1.0, easeOutCubic(clamp(tau / (seg.dur * 0.8))));
  L.scale(sc, sc);
  const r = rng(hashStr('mosaic'));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const rr = r();
      if (!photos.length) continue;
      const ph = photos[(idx * 7 + row) % photos.length];
      const a0 = env.assets.getThumb(ph.path);
      const x = -bw / 2 + col * (tw + gap) + (row % 2 ? (tw + gap) * 0.5 : 0) - (tw + gap) * 0.25;
      const y = -bh / 2 + row * (th + gap);
      const dist = Math.hypot(col - (cols - 1) / 2, row - (rows - 1) / 2) / 4.5;
      const st = (dist * 1.5 + rr * 0.35) * k;
      const a = easeOutCubic(prog(tau, st, st + 0.9 * k));
      if (a <= 0) continue;
      L.save();
      L.globalAlpha = a;
      const s2 = lerp(0.9, 1, a);
      L.translate(x + tw / 2, y + th / 2);
      L.scale(s2, s2);
      L.beginPath();
      L.roundRect(-tw / 2, -th / 2, tw, th, 6 * u);
      L.clip();
      if (a0 && !a0.failed) drawCover(L, a0.img, a0.w, a0.h, -tw / 2, -th / 2, tw, th, 1.04);
      else {
        L.fillStyle = theme.bg[1];
        L.fillRect(-tw / 2, -th / 2, tw, th);
      }
      L.restore();
    }
  }
  L.restore();
  const dim = easeInOutSine(prog(tau, 2.2 * k, 3.6 * k));
  ctx.save();
  if (dim > 0.01) ctx.filter = `blur(${(5 * u * dim).toFixed(2)}px)`;
  ctx.drawImage(env.layer, 0, 0);
  ctx.restore();
  // 텍스트 가독성 확보용 오버레이
  ctx.save();
  ctx.globalAlpha = dim;
  ctx.fillStyle = theme.dark ? theme.scrim + '0.62)' : rgba(theme.bg[0], 0.8);
  ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.55);
  rg.addColorStop(0, theme.dark ? theme.scrim + '0.55)' : rgba(theme.bg[0], 0.6));
  rg.addColorStop(1, theme.dark ? theme.scrim + '0)' : rgba(theme.bg[0], 0));
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  drawBokeh(ctx, W, H, tau, { seed: 'mos', discs: 14, sparks: 40, color: theme.particle, alpha: dim * (theme.dark ? 0.9 : 0.5) });
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.025);
  drawLockup(ctx, env, tau, 2.7 * k, k, { onPhoto: theme.dark });
  ctx.restore();
  blackFadeIn(ctx, env, tau, 0.9);
}

/** 연도 카운터 인트로: 1996 → 2026 롤링 숫자 후 타이틀 */
function drawIntroCounter(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project } = env;
  const k = introK(seg.dur);
  const tx = project.text;
  drawThemeBackground(ctx, W, H, theme, tau, 1);
  drawBokeh(ctx, W, H, tau, { seed: 'cnt', discs: 18, sparks: 30, color: theme.particle, alpha: 0.6 });
  const y0 = parseInt(tx.startYear, 10);
  const y1 = parseInt(tx.endYear, 10);
  const valid = isFinite(y0) && isFinite(y1) && y1 > y0 && y1 - y0 < 500;
  let lockStart = 0.5 * k;
  if (valid) {
    lockStart = 3.0 * k;
    const cp = easeOutQuart(prog(tau, 0.3 * k, 2.5 * k));
    const v = lerp(y0, y1, cp);
    const aIn = easeOutCubic(prog(tau, 0.1 * k, 0.8 * k));
    const aOut = easeInOutSine(prog(tau, 2.65 * k, 3.25 * k));
    const a = aIn * (1 - aOut);
    if (a > 0.001) {
      const size = 210 * u;
      ctx.save();
      ctx.globalAlpha = a;
      if (aOut > 0) ctx.filter = `blur(${(14 * u * aOut).toFixed(2)}px)`;
      const sc = 1 - 0.06 * aOut;
      ctx.translate(W / 2, H * 0.5);
      ctx.scale(sc, sc);
      ctx.translate(-W / 2, -H * 0.5);
      drawOdometer(ctx, env, v, W / 2, 610 * u, size, y1);
      // 진행 라인
      const lw = 640 * u * cp;
      ctx.fillStyle = theme.accentSolid;
      ctx.globalAlpha = a * 0.8;
      ctx.fillRect(W / 2 - lw / 2, 680 * u, lw, Math.max(1, 2 * u));
      ctx.globalAlpha = a * 0.9;
      setFont(ctx, typo.eyebrow, 26 * u);
      ctx.fillStyle = theme.textDim;
      drawTracked(ctx, `${y0}`, W / 2 - 320 * u, 730 * u, 6 * u, 'left');
      drawTracked(ctx, `${y1}`, W / 2 + 320 * u, 730 * u, 6 * u, 'right');
      ctx.restore();
    }
  }
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.03);
  drawLockup(ctx, env, tau, lockStart, k);
  ctx.restore();
  blackFadeIn(ctx, env, tau, 0.9);
}

function drawOdometer(ctx, env, v, cx, y, size, maxVal) {
  const { typo, theme, W, H } = env;
  const L = env.numLayerCtx;
  L.clearRect(0, 0, W, H);
  setFont(L, typo.display, size);
  L.textBaseline = 'alphabetic';
  const digits = String(Math.floor(maxVal)).length;
  const n = Math.floor(v);
  const f = v - n;
  const str = String(n).padStart(digits, '0');
  const dw = L.measureText('0').width * 1.02;
  const total = dw * digits;
  const asc = L.measureText('0').actualBoundingBoxAscent;
  const rowH = asc * 1.35;
  const top = y - asc - asc * 0.3;
  const bot = y + asc * 0.3;
  L.fillStyle = accentGradient(L, theme, y - asc, y + size * 0.05);
  L.textAlign = 'center';
  for (let i = 0; i < digits; i++) {
    const pow = digits - 1 - i;
    const d = parseInt(str[i], 10);
    const lower = n % Math.pow(10, pow);
    const carry = pow === 0 || lower === Math.pow(10, pow) - 1;
    const off = carry && v < maxVal ? easeInOutSine(f) : 0;
    const x = cx - total / 2 + dw * (i + 0.5);
    L.fillText(String(d), x, y - off * rowH);
    if (off > 0) L.fillText(String((d + 1) % 10), x, y + (1 - off) * rowH);
  }
  // 위아래 부드러운 마스크 (굴러가는 숫자가 잘려 보이지 않게)
  L.globalCompositeOperation = 'destination-in';
  const g = L.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.22, 'rgba(0,0,0,1)');
  g.addColorStop(0.8, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  L.fillStyle = g;
  L.fillRect(0, 0, W, H);
  L.globalCompositeOperation = 'source-over';
  L.textAlign = 'left';
  const rx = Math.max(0, cx - total / 2 - 40);
  const ry = Math.max(0, top - 10);
  ctx.drawImage(env.numLayer, rx, ry, total + 80, bot - top + 20, rx, ry, total + 80, bot - top + 20);
}

// =====================================================================
// 사진 장면
// =====================================================================
export function photoFitMode(item, asset, style, W, H) {
  const fit = item.fit && item.fit !== 'auto' ? item.fit : style.fit;
  if (fit === 'cover' || fit === 'contain') return fit;
  if (!asset) return 'cover';
  const ar = asset.srcW / asset.srcH;
  return Math.abs(Math.log(ar / (W / H))) < 0.19 ? 'cover' : 'contain';
}

function drawPhoto(ctx, seg, tau, env) {
  const { W, H, u, theme, project } = env;
  const it = seg.item;
  const a = env.assets.get(it.path);
  if (!a || a.failed) {
    drawThemeBackground(ctx, W, H, theme, tau, 0.5);
    if (a?.failed) {
      setFont(ctx, env.typo.body, 30 * u);
      ctx.fillStyle = theme.textDim;
      drawTracked(ctx, '사진을 불러올 수 없습니다', W / 2, H / 2, 0);
    }
    return;
  }
  const p = clamp(tau / seg.dur);
  const e = lerp(p, easeInOutSine(p), 0.4);
  const m = seg.motion || { type: 'zoomIn', amount: 1, fx: 0, fy: 0 };
  const amt = m.amount;
  const mode = photoFitMode(it, a, project.style, W, H);
  const iw = a.w;
  const ih = a.h;

  if (mode === 'cover') {
    const Z = 0.12 * amt;
    let z0 = 1.015, z1 = 1.015, px0 = 0, px1 = 0, py0 = 0, py1 = 0;
    const fx = m.fx * 0.35;
    const fy = -0.15 + m.fy * 0.25; // 인물 얼굴이 주로 위쪽에 있어 약간 위로 치우침
    switch (m.type) {
      case 'zoomOut': z0 = 1.015 + Z; px0 = px1 = fx; py0 = py1 = fy; break;
      case 'panLeft': z0 = z1 = 1.04 + Z * 0.6; px0 = 0.85; px1 = -0.85; py0 = py1 = fy; break;
      case 'panRight': z0 = z1 = 1.04 + Z * 0.6; px0 = -0.85; px1 = 0.85; py0 = py1 = fy; break;
      case 'panUp': z0 = z1 = 1.04 + Z * 0.6; py0 = 0.7; py1 = -0.7; px0 = px1 = fx; break;
      case 'panDown': z0 = z1 = 1.04 + Z * 0.6; py0 = -0.7; py1 = 0.7; px0 = px1 = fx; break;
      default: z1 = 1.015 + Z; px0 = px1 = fx; py0 = py1 = fy;
    }
    if (amt === 0) { z0 = z1 = 1.0; px0 = px1 = py0 = py1 = 0; }
    const z = lerp(z0, z1, e);
    const s = Math.max(W / iw, H / ih) * z;
    const dw = iw * s;
    const dh = ih * s;
    const x = (W - dw) / 2 + lerp(px0, px1, e) * ((dw - W) / 2);
    const y = (H - dh) / 2 + lerp(py0, py1, e) * ((dh - H) / 2);
    ctx.drawImage(a.img, x, y, dw, dh);
  } else {
    // 블러 배경 + 그림자 있는 원본 비율 사진
    const bgz = 1.08 + 0.06 * e * Math.max(0.3, amt);
    drawCover(ctx, a.bg, a.bg.width, a.bg.height, 0, 0, W, H, bgz);
    ctx.fillStyle = theme.dark ? theme.scrim + '0.42)' : 'rgba(18,12,6,0.3)';
    ctx.fillRect(0, 0, W, H);
    const zz = 0.05 * amt;
    const zoom = m.type === 'zoomOut' ? lerp(1 + zz, 1, e) : lerp(1, 1 + zz, e);
    const frame = project.style.photoFrame;
    const pad = frame ? 16 * u : 0;
    const maxW = W * 0.9 - pad * 2;
    const maxH = H * (frame ? 0.84 : 0.88) - pad * 2;
    const s = Math.min(maxW / iw, maxH / ih) * zoom;
    const dw = iw * s;
    const dh = ih * s;
    const drift = (m.type === 'panLeft' ? -1 : m.type === 'panRight' ? 1 : 0) * 18 * u * amt;
    const x = (W - dw) / 2 + lerp(-drift, drift, e);
    const y = (H - dh) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 70 * u;
    ctx.shadowOffsetY = 22 * u;
    ctx.fillStyle = frame ? '#fbf8f1' : '#000';
    ctx.fillRect(x - pad, y - pad, dw + pad * 2, dh + pad * 2);
    ctx.restore();
    ctx.drawImage(a.img, x, y, dw, dh);
    if (frame) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(x, y, dw, dh);
    }
  }

  if ((it.caption && it.caption.trim()) || (it.label && it.label.trim())) drawCaption(ctx, seg, tau, env);
}

function drawCaption(ctx, seg, tau, env) {
  const { W, H, u, theme, typo } = env;
  const it = seg.item;
  const inS = seg.tIn * 0.6 + 0.15;
  const outE = seg.dur - seg.tOut * 0.55;
  const a = inOut(tau, inS, inS + 1.0, Math.max(inS + 1.2, outE - 0.8), outE);
  if (a <= 0.001) return;
  const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, `rgba(0,0,0,${0.32 * a})`);
  g.addColorStop(1, `rgba(0,0,0,${0.7 * a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  const x = W * 0.068;
  const slide = (1 - easeOutCubic(prog(tau, inS, inS + 1.1))) * -26 * u;
  const label = (it.label || '').trim();
  const cap = (it.caption || '').trim();
  const capY = 985 * u;
  ctx.save();
  ctx.translate(slide, 0);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18 * u;
  if (label) {
    const ly = cap ? 900 * u : 960 * u;
    const size = fitFontSize(ctx, typo.display, label, 92 * u, W * 0.6, 0.02);
    setFont(ctx, typo.display, size, Math.max(500, typo.display.weight));
    ctx.globalAlpha = a;
    ctx.fillStyle = accentGradient(ctx, { ...theme, accent: env.darkAccent }, ly - size * 0.75, ly + size * 0.1);
    drawTracked(ctx, label, x, ly, size * 0.02, 'left');
  }
  if (cap) {
    const lineA = easeOutCubic(prog(tau, inS + 0.3, inS + 1.2)) * a;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = lineA;
    ctx.fillStyle = env.darkAccentSolid;
    ctx.fillRect(x, capY - 46 * u, 64 * u * lineA, Math.max(1, 2 * u));
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 14 * u;
    const size = fitFontSize(ctx, typo.body, cap, 40 * u, W * 0.8, 0.01);
    setFont(ctx, typo.body, size, Math.max(500, typo.body.weight));
    ctx.fillStyle = '#fbf7ee';
    drawCharsReveal(ctx, cap, x, capY, {
      t: tau, start: inS + 0.35, stagger: Math.min(0.03, 0.8 / Math.max(1, visibleChars(cap))), dur: 0.7, rise: 10 * u, tracking: size * 0.01, align: 'left', alpha: a,
    });
  }
  ctx.restore();
}

// =====================================================================
// 챕터 카드 (예: "1996 · 작은 시작")
// =====================================================================
function drawChapter(ctx, seg, tau, env) {
  const { W, H, u, theme, typo } = env;
  const it = seg.item;
  const bgA = seg.nextPhoto ? env.assets.get(seg.nextPhoto.path) : null;
  const p = clamp(tau / seg.dur);
  if (bgA && !bgA.failed) {
    drawCover(ctx, bgA.bg, bgA.bg.width, bgA.bg.height, 0, 0, W, H, lerp(1.18, 1.06, easeOutCubic(p)));
    ctx.fillStyle = theme.dark ? theme.scrim + '0.66)' : rgba(theme.bg[0], 0.8);
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, theme.dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.08)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  } else {
    drawThemeBackground(ctx, W, H, theme, tau, 1);
  }
  drawBokeh(ctx, W, H, tau + seg.index, { seed: 'ch' + seg.index, discs: 12, sparks: 34, color: theme.particle, alpha: theme.dark ? 0.75 : 0.45 });

  const s0 = seg.tIn * 0.5;
  const cx = W / 2;
  const title = (it.title || '').trim();
  const sub = (it.subtitle || '').trim();
  const outA = 1 - easeInOutSine(prog(tau, seg.dur - seg.tOut * 0.9, seg.dur - seg.tOut * 0.2));
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.03);
  ctx.globalAlpha = outA;
  const ty = sub ? 560 * u : 610 * u;
  if (title) {
    const a = easeOutCubic(prog(tau, s0, s0 + 1.4));
    const size = fitFontSize(ctx, typo.display, title, 190 * u, W * 0.84, 0.04);
    setFont(ctx, typo.display, size);
    const trk = size * lerp(0.22, 0.04, easeOutQuart(prog(tau, s0, s0 + 2.2)));
    ctx.save();
    ctx.globalAlpha = a * outA;
    const blur = 16 * u * (1 - a);
    if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.shadowColor = rgba(theme.particle, theme.dark ? 0.35 : 0.2);
    ctx.shadowBlur = 40 * u;
    ctx.fillStyle = accentGradient(ctx, theme, ty - size * 0.72, ty + size * 0.05);
    drawTracked(ctx, title, cx, ty, trk);
    ctx.restore();
  }
  const lg = easeInOutCubic(prog(tau, s0 + 0.6, s0 + 1.8));
  if (lg > 0) {
    ctx.fillStyle = theme.accentSolid;
    ctx.globalAlpha = 0.8 * lg * outA;
    const len = 90 * u * lg;
    const ly = (sub ? 618 : 668) * u;
    ctx.fillRect(cx - len, ly, len * 2, Math.max(1, 1.6 * u));
  }
  if (sub) {
    const size = fitFontSize(ctx, typo.title, sub, 52 * u, W * 0.8, 0.04);
    setFont(ctx, typo.title, size);
    ctx.fillStyle = theme.text;
    ctx.globalAlpha = outA;
    drawCharsReveal(ctx, sub, cx, 700 * u, {
      t: tau, start: s0 + 0.9, stagger: Math.min(0.06, 1 / Math.max(1, visibleChars(sub))), dur: 0.9, rise: 16 * u, tracking: size * 0.04, blur: 4 * u,
    });
  }
  ctx.restore();
}

// =====================================================================
// 아웃트로: 사진 갤러리 월(천천히 스크롤) + 감사 메시지 + 블랙 페이드아웃
// =====================================================================
function drawOutro(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project, tl } = env;
  const tx = project.text;
  ctx.fillStyle = theme.bg[0];
  ctx.fillRect(0, 0, W, H);
  const photos = tl.gallery;
  if (photos.length) {
    const cols = 5;
    const colW = W * 0.205;
    const gap = W * 0.012;
    const totalW = cols * colW + (cols - 1) * gap;
    const x0 = (W - totalW) / 2;
    const r = rng(hashStr('outro'));
    for (let c = 0; c < cols; c++) {
      const speed = (38 + r() * 30) * u * (c % 2 ? 1 : -1);
      const offset0 = r() * H;
      // 컬럼에 들어갈 사진 목록 (고정 순서)
      const list = [];
      for (let i = 0; i < 8; i++) list.push(photos[(c * 5 + i * 3) % photos.length]);
      const hs = list.map((ph) => {
        const a = env.assets.getThumb(ph.path);
        return a && !a.failed ? colW * Math.min(1.4, Math.max(0.6, a.h / a.w)) : colW * 0.75;
      });
      const colH = hs.reduce((s, h) => s + h + gap, 0);
      let y = (((offset0 + speed * tau) % colH) + colH) % colH - colH;
      const x = x0 + c * (colW + gap);
      while (y < H) {
        for (let i = 0; i < list.length && y < H; i++) {
          const h = hs[i];
          if (y + h > 0) {
            const a = env.assets.getThumb(list[i].path);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, colW, h, 5 * u);
            ctx.clip();
            if (a && !a.failed) drawCover(ctx, a.img, a.w, a.h, x, y, colW, h);
            else {
              ctx.fillStyle = theme.bg[1];
              ctx.fillRect(x, y, colW, h);
            }
            ctx.restore();
          }
          y += h + gap;
        }
      }
    }
    ctx.fillStyle = theme.dark ? theme.scrim + '0.7)' : rgba(theme.bg[0], 0.84);
    ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.5);
    rg.addColorStop(0, theme.dark ? theme.scrim + '0.6)' : rgba(theme.bg[0], 0.7));
    rg.addColorStop(1, theme.dark ? theme.scrim + '0)' : rgba(theme.bg[0], 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  } else {
    drawThemeBackground(ctx, W, H, theme, tau, 1);
  }
  drawBokeh(ctx, W, H, tau, { seed: 'out', discs: 16, sparks: 50, color: theme.particle, alpha: theme.dark ? 0.8 : 0.45 });

  const s0 = seg.tIn * 0.55;
  const cx = W / 2;
  const logo = tx.logo ? env.assets.getThumb(tx.logo) : null;
  const msgLines = (tx.closingMessage || '').split('\n').map((l) => l.trim()).filter(Boolean);
  // 세로 레이아웃 계산
  const blocks = [];
  if (tx.closingTitle) blocks.push({ k: 'title', h: 150 });
  if (msgLines.length) blocks.push({ k: 'msg', h: msgLines.length * 58 + 20 });
  if (tx.closingSub) blocks.push({ k: 'sub', h: 70 });
  if (tx.org) blocks.push({ k: 'org', h: 80 });
  if (logo && !logo.failed) blocks.push({ k: 'logo', h: 130 });
  const totalH = blocks.reduce((s, b) => s + b.h, 0);
  let y = 540 - totalH / 2;

  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.035);
  if (photos.length) {
    // 움직이는 사진 위 글자 가독성
    ctx.shadowColor = theme.dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 22 * u;
  }
  let t0 = s0;
  for (const b of blocks) {
    if (b.k === 'title') {
      const size = fitFontSize(ctx, typo.title, tx.closingTitle, 112 * u, W * 0.84, 0.04);
      setFont(ctx, typo.title, size);
      ctx.fillStyle = accentGradient(ctx, theme, (y + 115) * u - size * 0.85, (y + 115) * u + size * 0.15);
      ctx.save();
      ctx.shadowColor = rgba(theme.particle, theme.dark ? 0.3 : 0.15);
      ctx.shadowBlur = 36 * u;
      drawCharsReveal(ctx, tx.closingTitle, cx, (y + 115) * u, {
        t: tau, start: t0, stagger: Math.min(0.09, 1 / Math.max(1, visibleChars(tx.closingTitle))), dur: 1.1, rise: 24 * u, tracking: size * 0.04, blur: 8 * u,
      });
      ctx.restore();
      t0 += 1.2;
    } else if (b.k === 'msg') {
      msgLines.forEach((line, i) => {
        const size = fitFontSize(ctx, typo.body, line, 38 * u, W * 0.8, 0.02);
        setFont(ctx, typo.body, size);
        const a = easeOutCubic(prog(tau, t0 + i * 0.35, t0 + i * 0.35 + 1.1));
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = theme.text;
        drawTracked(ctx, line, cx, (y + 52 + i * 58) * u + (1 - a) * 14 * u, size * 0.02);
        ctx.restore();
      });
      t0 += 0.6 + msgLines.length * 0.35;
    } else if (b.k === 'sub') {
      const size = fitFontSize(ctx, typo.title, tx.closingSub, 34 * u, W * 0.8, 0.08);
      setFont(ctx, typo.title, size);
      const a = easeOutCubic(prog(tau, t0, t0 + 1.2));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = theme.accentSolid;
      drawTracked(ctx, tx.closingSub, cx, (y + 48) * u, size * lerp(0.2, 0.08, a));
      ctx.restore();
      t0 += 0.6;
    } else if (b.k === 'org') {
      const a = easeOutCubic(prog(tau, t0, t0 + 1.2));
      const size = fitFontSize(ctx, typo.eyebrow, tx.org, 30 * u, W * 0.7, 0.24);
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = theme.accentSolid;
      const lw = 44 * u * a;
      ctx.fillRect(cx - lw, (y + 14) * u, lw * 2, Math.max(1, 1.4 * u));
      ctx.globalAlpha = a;
      setFont(ctx, typo.eyebrow, size, Math.max(500, typo.eyebrow.weight));
      ctx.fillStyle = theme.textDim;
      drawTracked(ctx, tx.org, cx, (y + 62) * u, size * 0.24);
      ctx.restore();
      t0 += 0.5;
    } else if (b.k === 'logo') {
      const a = easeOutCubic(prog(tau, t0, t0 + 1.2));
      const lh = 84 * u;
      const lw = Math.min(W * 0.32, (logo.w / logo.h) * lh);
      const lhh = (lw / logo.w) * logo.h;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(logo.img, cx - lw / 2, (y + 65) * u - lhh / 2, lw, lhh);
      ctx.restore();
    }
    y += b.h;
  }
  ctx.restore();

  // 마지막 블랙 페이드아웃 (행사 진행자가 정지할 여유)
  const fo = easeInOutSine(prog(tau, seg.dur - 2.4, seg.dur - 0.4));
  if (fo > 0) {
    ctx.save();
    ctx.globalAlpha = fo;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** 캡션용 금색: 밝은 테마여도 사진 위에서는 밝은 금색 사용 */
export function captionAccent(theme) {
  if (theme.dark) return { accent: theme.accent, solid: theme.accentSolid };
  return { accent: ['#8a6424', '#d2ac57', '#f3dea0', '#fff3cf', '#e0bd6a', '#9a7230'], solid: '#e6c977' };
}

export { hexToRgb };
