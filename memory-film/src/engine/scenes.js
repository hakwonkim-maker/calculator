// 장면 렌더러: 인트로(8종), 사진(켄번스 + 캡션), 챕터 카드, 아웃트로(3종)
// 모든 함수는 (ctx, seg, tau, env) → 시간 tau에 대한 순수 함수 (결정적)
// 크기 단위 u = min(W,H)/1080 : 1080 기준 픽셀로 디자인하고 해상도에 비례해 확대/축소
// 세로(9:16)·정사각 화면에서는 env.oy 만큼 텍스트 블록을 세로 중앙으로 이동

import {
  setFont, rgba, accentGradient, drawTracked, measureTracked, fitFontSize,
  drawCharsReveal, visibleChars, drawBokeh, drawThemeBackground, drawCover, hexToRgb, withBlur, drawDownBlurred,
} from './draw.js';
import { prog, clamp, lerp, easeOutCubic, easeInOutSine, easeOutQuart, easeInOutCubic, inOut, rng, hashStr } from './math.js';
import { itemKey } from './assets.js';
import { introTiming } from './presets.js';
import { drawMontage } from './montage.js';

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
    case 'group':
      drawMontage(ctx, seg, tau, env);
      if (seg.folder) drawFolderTag(ctx, seg, tau, env);
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
  if (seg.type === 'photo' || seg.type === 'group') return 1;
  if (seg.type === 'chapter') return 0.35;
  return 0;
}

// =====================================================================
// 공통: 타이틀 락업 (숫자 · ANNIVERSARY · 제목 · 연도 · 기관명 · 로고)
// =====================================================================
function drawLockup(ctx, env, tau, s, k, opts = {}) {
  ctx.save();
  ctx.translate(0, env.oy);
  // 어두운 사진 위에 쓰는 인트로: 밝은 테마여도 밝은 글자·금색으로
  if (opts.darkBg && !env.theme.dark) {
    const ca = captionAccent(env.theme);
    env = { ...env, theme: { ...env.theme, dark: true, text: '#fbf8f1', textDim: 'rgba(251,248,241,0.75)', accent: ca.accent, accentSolid: ca.solid, particle: '#f0cf82' } };
  }
  drawLockupBody(ctx, env, tau, s, k, opts);
  ctx.restore();
}

function drawLockupBody(ctx, env, tau, s, k, opts = {}) {
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
      // 금박 숫자 + 글로우는 한 번만 그려 캐시 (매 프레임 그림자 블러 계산 제거)
      const ckey = `num|${tx.number}|${size.toFixed(1)}|${theme.accent.join()}|${typo.display.family}|${W}x${env.H}`;
      let cached = env.cache.get(ckey);
      if (!cached) {
        cached = new OffscreenCanvas(Math.max(1, Math.ceil(rw)), Math.max(1, Math.ceil(rh)));
        const g = cached.getContext('2d');
        g.translate(-rx, -ry);
        setFont(g, typo.display, size);
        g.textBaseline = 'alphabetic';
        g.shadowColor = rgba(theme.particle, theme.dark ? 0.42 : 0.28);
        g.shadowBlur = 46 * u;
        g.fillStyle = accentGradient(g, theme, y - asc, y + desc);
        drawTracked(g, tx.number, cx, y, size * 0.02);
        cached = cached.transferToImageBitmap();
      env.cache.set(ckey, cached);
      }
      let src = cached;
      let sx = 0;
      let sy = 0;
      const sp = prog(tau, T(1.9), T(3.4));
      if (sp > 0 && sp < 1) {
        L.clearRect(rx - 2, ry - 2, rw + 4, rh + 4);
        L.drawImage(cached, rx, ry);
        src = env.numLayer;
        sx = rx;
        sy = ry;
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
      withBlur(ctx, blur, rx, ry, rw, rh, (g) => g.drawImage(src, sx, sy, rw, rh, rx, ry, rw, rh));
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
/** 인트로 타이밍: 길이·글자 속도·사진만 보이는 시간 설정 반영 */
const introT = (env, seg) => introTiming(env.project.intro, seg.dur);

// =====================================================================
// 인트로
// =====================================================================
function drawIntro(ctx, seg, tau, env) {
  const style = env.project.intro.style;
  const fn = {
    mosaic: drawIntroMosaic,
    light: drawIntroCounter,
    cinematic: drawIntroCinematic,
    polaroid: drawIntroPolaroid,
    bloom: drawIntroBloom,
    minimal: drawIntroMinimal,
    filmleader: drawIntroFilmLeader,
    timeroll: drawIntroTimeRoll,
    flashcut: drawIntroFlashCut,
  }[style] || drawIntroGolden;
  fn(ctx, seg, tau, env);
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
    env._raySprite = c.transferToImageBitmap();
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
  const IT = introT(env, seg);
  const k = IT.k;
  drawThemeBackground(ctx, W, H, theme, tau, 1.3);
  drawRays(ctx, env, tau, easeOutCubic(prog(tau, 0.2, 3)));
  drawBokeh(ctx, W, H, tau + 4, { seed: 'gold', discs: 30, sparks: 70, color: theme.particle, alpha: easeOutCubic(prog(tau, 0, 2.6)) * (theme.dark ? 1 : 0.6) });
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.035);
  drawLockup(ctx, env, tau, IT.s, k);
  ctx.restore();
  blackFadeIn(ctx, env, tau, 1.2);
}

function drawIntroMosaic(ctx, seg, tau, env) {
  const { W, H, u, theme, tl } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  ctx.fillStyle = theme.bg[0];
  ctx.fillRect(0, 0, W, H);
  const photos = tl.gallery;
  const L = env.layerCtx;
  L.clearRect(0, 0, W, H);
  L.save();
  const th = 313 * u;
  const tw = th * 1.38;
  const gap = 14 * u;
  const cols = Math.ceil((W * 1.55) / (tw + gap)) + 1;
  const rows = Math.ceil((H * 1.55) / (th + gap)) + 1;
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
      const a0 = env.assets.getThumb(itemKey(ph));
      const x = -bw / 2 + col * (tw + gap) + (row % 2 ? (tw + gap) * 0.5 : 0) - (tw + gap) * 0.25;
      const y = -bh / 2 + row * (th + gap);
      const dist = Math.hypot(col - (cols - 1) / 2, row - (rows - 1) / 2) / (Math.hypot(cols, rows) / 2.6);
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
  const dim = easeInOutSine(prog(tau, IT.s - 0.5 * k, IT.s + 0.9 * k));
  const dimA = IT.dim == null ? 0.62 : IT.dim;
  if (dim > 0.01) drawDownBlurred(ctx, env.layer, W, H, 5 * u * dim + 2, 3);
  else ctx.drawImage(env.layer, 0, 0);
  // 텍스트 가독성 확보용 오버레이
  ctx.save();
  ctx.globalAlpha = dim;
  ctx.fillStyle = theme.dark ? theme.scrim + dimA + ')' : rgba(theme.bg[0], Math.min(0.95, dimA + 0.18));
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
  drawLockup(ctx, env, tau, IT.s, k, { onPhoto: theme.dark });
  ctx.restore();
  blackFadeIn(ctx, env, tau, 0.9);
}

/** 연도 카운터 인트로: 1996 → 2026 롤링 숫자 후 타이틀 */
function drawIntroCounter(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project } = env;
  const IT = introT(env, seg);
  const k = IT.k;
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
      const sc = 1 - 0.06 * aOut;
      ctx.translate(W / 2, H * 0.5);
      ctx.scale(sc, sc);
      ctx.translate(-W / 2, -H * 0.5);
      const body = (g) => {
        drawOdometer(g, env, v, W / 2, 610 * u + env.oy, size, y1);
        const lw = 640 * u * cp;
        g.fillStyle = theme.accentSolid;
        g.globalAlpha = 0.8;
        g.fillRect(W / 2 - lw / 2, 680 * u + env.oy, lw, Math.max(1, 2 * u));
        g.globalAlpha = 0.9;
        setFont(g, typo.eyebrow, 26 * u);
        g.fillStyle = theme.textDim;
        drawTracked(g, `${y0}`, W / 2 - 320 * u, 730 * u + env.oy, 6 * u, 'left');
        drawTracked(g, `${y1}`, W / 2 + 320 * u, 730 * u + env.oy, 6 * u, 'right');
        g.globalAlpha = 1;
      };
      withBlur(ctx, 14 * u * aOut, W / 2 - 380 * u, 360 * u + env.oy, 760 * u, 400 * u, body);
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
  const a = env.assets.get(itemKey(it));
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
    // 초점: 사용자가 지정한 중심점, 없으면 약간 위쪽(인물 얼굴이 주로 위쪽에 있음)
    const foc = it.focus;
    const fx = foc ? clamp((0.5 - foc.x) * 2, -1, 1) : m.fx * 0.35;
    const fy = foc ? clamp((0.5 - foc.y) * 2, -1, 1) : 0.15 + m.fy * 0.25;
    const pr = foc ? 0.55 : 0.85;
    switch (m.type) {
      case 'zoomOut': z0 = 1.015 + Z; px0 = px1 = fx; py0 = py1 = fy; break;
      case 'panLeft': z0 = z1 = 1.04 + Z * 0.6; px0 = clamp(fx * 0.4 + pr, -1, 1); px1 = clamp(fx * 0.4 - pr, -1, 1); py0 = py1 = fy; break;
      case 'panRight': z0 = z1 = 1.04 + Z * 0.6; px0 = clamp(fx * 0.4 - pr, -1, 1); px1 = clamp(fx * 0.4 + pr, -1, 1); py0 = py1 = fy; break;
      case 'panUp': z0 = z1 = 1.04 + Z * 0.6; py0 = clamp(fy * 0.4 + pr * 0.8, -1, 1); py1 = clamp(fy * 0.4 - pr * 0.8, -1, 1); px0 = px1 = fx; break;
      case 'panDown': z0 = z1 = 1.04 + Z * 0.6; py0 = clamp(fy * 0.4 - pr * 0.8, -1, 1); py1 = clamp(fy * 0.4 + pr * 0.8, -1, 1); px0 = px1 = fx; break;
      default: z1 = 1.015 + Z; px0 = px1 = fx; py0 = py1 = fy;
    }
    if (amt === 0) {
      z0 = z1 = 1.0;
      px0 = px1 = foc ? fx : 0;
      py0 = py1 = foc ? fy : 0;
    }
    const z = lerp(z0, z1, e);
    const s = Math.max(W / iw, H / ih) * z;
    const dw = iw * s;
    const dh = ih * s;
    let px = lerp(px0, px1, e);
    let py = lerp(py0, py1, e);
    if (foc) {
      // 지정한 중심점이 화면 안쪽(15~85%)에 항상 남도록 이동 범위를 제한
      px = keepVisible(px, foc.x, W, dw);
      py = keepVisible(py, foc.y, H, dh);
    }
    const x = (W - dw) / 2 + px * ((dw - W) / 2);
    const y = (H - dh) / 2 + py * ((dh - H) / 2);
    ctx.drawImage(a.img, x, y, dw, dh);
  } else {
    // 블러 배경 + 그림자 있는 원본 비율 사진
    const bgz = 1.08 + 0.06 * e * Math.max(0.3, amt);
    // 이미 흐린 배경·그림자는 고품질 리샘플링이 의미 없음 → 빠른 보간 (소프트웨어 렌더링에서 2배 이상 빠름)
    ctx.imageSmoothingQuality = 'low';
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
    // 그림자: 사진마다 1/4 해상도로 한 번만 블러해 캐시 → 매 프레임 그림자 블러 계산 제거
    const bw0 = iw * Math.min(maxW / iw, maxH / ih) + pad * 2;
    const bh0 = ih * Math.min(maxW / iw, maxH / ih) + pad * 2;
    const B = 110 * u;
    const sk = `shadow|${Math.round(bw0)}x${Math.round(bh0)}|${W}x${H}`;
    let sh = env.cache.get(sk);
    if (!sh) {
      const q = 4;
      sh = new OffscreenCanvas(Math.ceil((bw0 + B * 2) / q), Math.ceil((bh0 + B * 2) / q));
      const g = sh.getContext('2d');
      g.filter = `blur(${((35 * u) / q).toFixed(2)}px)`;
      g.fillStyle = 'rgba(0,0,0,0.62)';
      g.fillRect(B / q, B / q, bw0 / q, bh0 / q);
      sh = sh.transferToImageBitmap();
      env.cache.set(sk, sh);
    }
    const zs = (dw + pad * 2) / bw0;
    ctx.drawImage(sh, x - pad - B * zs, y - pad - B * zs + 22 * u, (bw0 + B * 2) * zs, (bh0 + B * 2) * zs);
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = frame ? '#fbf8f1' : '#000';
    ctx.fillRect(x - pad, y - pad, dw + pad * 2, dh + pad * 2);
    ctx.drawImage(a.img, x, y, dw, dh);
    if (frame) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(x, y, dw, dh);
    }
  }

  if ((it.caption && it.caption.trim()) || (it.label && it.label.trim())) drawCaption(ctx, seg, tau, env);
  if (seg.folder) drawFolderTag(ctx, seg, tau, env);
  drawWatermark(ctx, env);
}

/** 폴더명 태그: 왼쪽 위 작은 금색 선 + 글자 (워터마크가 왼쪽 위면 오른쪽 위) */
function drawFolderTag(ctx, seg, tau, env) {
  const { W, H, u, typo } = env;
  const inS = seg.tIn * 0.7 + 0.1;
  const outE = seg.dur - seg.tOut * 0.6;
  const a = inOut(tau, inS, inS + 0.8, Math.max(inS + 0.9, outE - 0.6), outE);
  if (a <= 0.001) return;
  const right = env.project.style.watermark && (env.project.style.watermarkPos || 'tr') === 'tl';
  const key = `folder|${seg.folder}|${W}x${H}|${typo.body.family}|${right}`;
  let tag = env.cache.get(key);
  if (!tag) {
    const size = 30 * u;
    const pad = 64 * u;
    const c = new OffscreenCanvas(W, Math.ceil(170 * u));
    const g = c.getContext('2d');
    // 밝은 사진 위에서도 읽히도록 모서리 쪽을 살짝 어둡게 (가로로 늘린 원형 그라데이션 → 경계선 없음)
    const ch = c.height;
    g.save();
    g.translate(right ? W : 0, 0);
    g.scale(3.4, 1);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, ch);
    rg.addColorStop(0, 'rgba(0,0,0,0.42)');
    rg.addColorStop(0.6, 'rgba(0,0,0,0.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(-ch, 0, ch * 2, ch);
    g.restore();
    setFont(g, typo.body, size, Math.max(600, typo.body.weight));
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 10 * u;
    const tw = Math.min(W * 0.6, measureTracked(g, seg.folder, size * 0.04));
    const bx = right ? W - pad - tw - 18 * u : pad;
    g.fillStyle = env.darkAccentSolid;
    g.fillRect(bx, 56 * u, Math.max(1, 3 * u), 36 * u);
    g.fillStyle = '#fbf7ee';
    g.textBaseline = 'middle';
    drawTracked(g, seg.folder, bx + 18 * u, 74 * u, size * 0.04, 'left');
    tag = c.transferToImageBitmap();
    env.cache.set(key, tag);
  }
  ctx.save();
  ctx.globalAlpha = a;
  ctx.drawImage(tag, (1 - easeOutCubic(clamp((tau - inS) / 0.9))) * (right ? 14 : -14) * u, 0);
  ctx.restore();
}

/** 로고/기관명 워터마크 (사진·챕터 장면 구석에 상시 표시) */
function drawWatermark(ctx, env) {
  const { W, H, u, project, typo } = env;
  if (!project.style.watermark) return;
  const tx = project.text;
  const pos = project.style.watermarkPos || 'tr';
  const m = 46 * u;
  const right = pos.includes('r');
  const bottom = pos.includes('b');
  const logo = tx.logo ? env.assets.getThumb(tx.logo) : null;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12 * u;
  if (logo && !logo.failed) {
    const lh = 54 * u;
    const lw = Math.min(W * 0.22, (logo.w / logo.h) * lh);
    const hh = (lw / logo.w) * logo.h;
    ctx.drawImage(logo.img, right ? W - m - lw : m, bottom ? H - m - hh : m, lw, hh);
  } else if (tx.org) {
    setFont(ctx, typo.eyebrow, 24 * u, Math.max(500, typo.eyebrow.weight));
    ctx.fillStyle = '#fbf7ee';
    ctx.textBaseline = bottom ? 'alphabetic' : 'top';
    drawTracked(ctx, tx.org, right ? W - m : m, bottom ? H - m : m, 3 * u, right ? 'right' : 'left');
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/** 이동 계수 p(-1..1)를 중심점 f(0..1)가 화면 [15%, 85%] 안에 보이도록 제한 */
function keepVisible(p, f, S, d) {
  if (d - S < 1) return p;
  const lo = (2 * 0.85 * S - S + d - 2 * f * d) / (d - S);
  const hi = (2 * 0.15 * S - S + d - 2 * f * d) / (d - S);
  // p가 클수록 이미지가 아래/오른쪽으로 내려가 f의 화면 위치가 커짐 → hi/lo 순서 주의
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return clamp(clamp(p, a, b), -1, 1);
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

  const centered = env.project.style.captionPos === 'center';
  const align = centered ? 'center' : 'left';
  const x = centered ? W / 2 : W * 0.068;
  const slide = centered ? 0 : (1 - easeOutCubic(prog(tau, inS, inS + 1.1))) * -26 * u;
  const label = (it.label || '').trim();
  const cap = (it.caption || '').trim();
  const capY = 985 * u;
  // 등장 애니메이션이 끝난 뒤에는 미리 그린 자막 이미지를 재사용 (글자별 그림자 계산 제거)
  const capStagger = Math.min(0.03, 0.8 / Math.max(1, visibleChars(cap)));
  const tSteady = Math.max(inS + 1.25, inS + 0.35 + capStagger * visibleChars(cap) + 0.75);
  if (tau >= tSteady) {
    const ck = `cap|${label}|${cap}|${align}|${W}x${H}|${typo.display.family}|${typo.body.family}|${theme.dark}`;
    let cc = env.cache.get(ck);
    const top = 760 * u;
    const hgt = 300 * u;
    if (!cc) {
      cc = new OffscreenCanvas(W, Math.ceil(hgt));
      const g = cc.getContext('2d');
      g.translate(0, -top);
      drawCaptionText(g, env, label, cap, x, capY, align, centered, 1, 1, 1e9, 0, capStagger);
      cc = cc.transferToImageBitmap();
      env.cache.set(ck, cc);
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(cc, 0, H - 1080 * u + top);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(slide, H - 1080 * u);
  drawCaptionText(ctx, env, label, cap, x, capY, align, centered, a, easeOutCubic(prog(tau, inS + 0.3, inS + 1.2)) * a, tau, inS + 0.35, capStagger);
  ctx.restore();
}

function drawCaptionText(ctx, env, label, cap, x, capY, align, centered, a, lineA, tau, revealStart, stagger) {
  const { W, u, theme, typo } = env;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18 * u;
  if (label) {
    const ly = cap ? 900 * u : 960 * u;
    const size = fitFontSize(ctx, typo.display, label, 92 * u, W * 0.6, 0.02);
    setFont(ctx, typo.display, size, Math.max(500, typo.display.weight));
    ctx.globalAlpha = a;
    ctx.fillStyle = accentGradient(ctx, { ...theme, accent: env.darkAccent }, ly - size * 0.75, ly + size * 0.1);
    drawTracked(ctx, label, x, ly, size * 0.02, align);
  }
  if (cap) {
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = lineA;
    ctx.fillStyle = env.darkAccentSolid;
    ctx.fillRect(centered ? x - 32 * u * lineA : x, capY - 46 * u, 64 * u * lineA, Math.max(1, 2 * u));
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 14 * u;
    const size = fitFontSize(ctx, typo.body, cap, 40 * u, W * 0.8, 0.01);
    setFont(ctx, typo.body, size, Math.max(500, typo.body.weight));
    ctx.fillStyle = '#fbf7ee';
    drawCharsReveal(ctx, cap, x, capY, {
      t: tau, start: revealStart, stagger, dur: 0.7, rise: 10 * u, tracking: size * 0.01, align, alpha: a,
    });
  }
}

// =====================================================================
// 챕터 카드 (예: "1996 · 작은 시작")
// =====================================================================
function drawChapter(ctx, seg, tau, env) {
  const { W, H, u, theme, typo } = env;
  const it = seg.item;
  const bgA = seg.nextPhoto ? env.assets.get(itemKey(seg.nextPhoto)) : null;
  const p = clamp(tau / seg.dur);
  if (bgA && !bgA.failed) {
    ctx.imageSmoothingQuality = 'low';
    drawCover(ctx, bgA.bg, bgA.bg.width, bgA.bg.height, 0, 0, W, H, lerp(1.18, 1.06, easeOutCubic(p)));
    ctx.imageSmoothingQuality = 'high';
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
  ctx.translate(0, env.oy);
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
    const tw = measureTracked(ctx, title, trk);
    withBlur(ctx, blur, cx - tw / 2 - 60 * u, ty - size - 50 * u, tw + 120 * u, size * 1.4 + 100 * u, (g) => {
      setFont(g, typo.display, size);
      g.shadowColor = rgba(theme.particle, theme.dark ? 0.35 : 0.2);
      g.shadowBlur = 40 * u;
      g.fillStyle = accentGradient(g, theme, ty - size * 0.72, ty + size * 0.05);
      drawTracked(g, title, cx, ty, trk);
    });
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
  drawWatermark(ctx, env);
}

// =====================================================================
// 아웃트로: 사진 갤러리 월(천천히 스크롤) + 감사 메시지 + 블랙 페이드아웃
// =====================================================================
function drawOutro(ctx, seg, tau, env) {
  if (env.project.outro.style === 'credits') drawOutroCredits(ctx, seg, tau, env);
  else drawOutroGallery(ctx, seg, tau, env);
}

function drawOutroGallery(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project, tl } = env;
  const tx = project.text;
  ctx.fillStyle = theme.bg[0];
  ctx.fillRect(0, 0, W, H);
  const photos = project.outro.style === 'simple' ? [] : tl.gallery;
  if (photos.length) {
    const ar = W / H;
    const cols = ar > 1.2 ? 5 : ar > 0.9 ? 4 : 3;
    const gap = W * 0.012;
    const colW = (W * 1.02 - (cols - 1) * gap) / cols;
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
        const a = env.assets.getThumb(itemKey(ph));
        return a && !a.failed ? colW * Math.min(1.4, Math.max(0.6, a.h / a.w)) : colW * 0.75;
      });
      const colH = hs.reduce((s, h) => s + h + gap, 0);
      let y = (((offset0 + speed * tau) % colH) + colH) % colH - colH;
      const x = x0 + c * (colW + gap);
      while (y < H) {
        for (let i = 0; i < list.length && y < H; i++) {
          const h = hs[i];
          if (y + h > 0) {
            const a = env.assets.getThumb(itemKey(list[i]));
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
  ctx.translate(0, env.oy);
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

// =====================================================================
// 추가 인트로
// =====================================================================

/** 배경색에서 서서히 나타나기 (밝은 테마는 흰 배경, 어두운 테마는 검정) */
function bgFadeIn(ctx, env, tau, d = 1.2) {
  const f = 1 - easeInOutSine(prog(tau, 0, d));
  if (f <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = f;
  ctx.fillStyle = env.theme.dark ? '#000' : env.theme.bg[0];
  ctx.fillRect(0, 0, env.W, env.H);
  ctx.restore();
}

function fadeToBlack(ctx, env, tau, dur) {
  const fo = easeInOutSine(prog(tau, dur - 2.4, dur - 0.4));
  if (fo <= 0) return;
  ctx.save();
  ctx.globalAlpha = fo;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, env.W, env.H);
  ctx.restore();
}

/** 시네마 오프닝: 레터박스가 열리고, 첫 사진 위에 넓은 자간 타이틀 */
function drawIntroCinematic(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project, tl } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  const tx = project.text;
  const p = clamp(tau / seg.dur);
  const tt = tau - (IT.s - 1.0 * k); // 글자 시작을 '사진만 보이는 시간'만큼 늦춤
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const ph = tl.gallery[0];
  const a = ph ? env.assets.get(itemKey(ph)) : null;
  if (a && !a.failed) {
    const s = Math.max(W / a.w, H / a.h) * lerp(1.16, 1.04, easeOutCubic(p));
    const dw = a.w * s;
    const dh = a.h * s;
    // 흐림·채도·밝기 보정은 사진마다 한 번만 계산해 캐시 (매 프레임 전체 화면 필터 제거)
    const ck = `cine|${itemKey(ph)}|${W}x${H}`;
    let bg = env.cache.get(ck);
    if (!bg) {
      const bw = Math.max(1, Math.round(a.w / 2));
      const bh = Math.max(1, Math.round(a.h / 2));
      bg = new OffscreenCanvas(bw, bh);
      const g = bg.getContext('2d');
      g.filter = `blur(${(1.25 * u).toFixed(1)}px) saturate(0.55) brightness(0.5)`;
      g.drawImage(a.img, 0, 0, bw, bh);
      bg = bg.transferToImageBitmap();
      env.cache.set(ck, bg);
    }
    ctx.save();
    ctx.globalAlpha = easeOutCubic(prog(tau, 0.2, 2.4));
    ctx.drawImage(bg, (W - dw) / 2 + lerp(36, -36, p) * u, (H - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    drawThemeBackground(ctx, W, H, { ...theme, bg: theme.dark ? theme.bg : ['#07070a', '#1a1a22'] }, tau, 0.6);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const dm = IT.dim == null ? 1 : IT.dim / 0.55;
  g.addColorStop(0, `rgba(0,0,0,${Math.min(0.95, 0.55 * dm)})`);
  g.addColorStop(0.5, `rgba(0,0,0,${Math.min(0.9, 0.12 * dm)})`);
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, 0.65 * dm)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawBokeh(ctx, W, H, tau, { seed: 'cine', discs: 8, sparks: 26, color: theme.dark ? theme.particle : '#f0cf82', alpha: 0.5 });
  const gold = theme.dark ? theme : { ...theme, accent: captionAccent(theme).accent, accentSolid: captionAccent(theme).solid };

  // 배경의 큰 윤곽 숫자
  if (tx.number) {
    const size = fitFontSize(ctx, typo.display, tx.number, 560 * u, W * 0.95);
    setFont(ctx, typo.display, size);
    ctx.save();
    ctx.globalAlpha = 0.16 * easeOutCubic(prog(tt, 0.8 * k, 3.2 * k));
    ctx.strokeStyle = gold.accentSolid;
    ctx.lineWidth = Math.max(1, 1.6 * u);
    const sc = lerp(1.08, 1, easeOutCubic(p));
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    ctx.textBaseline = 'middle';
    drawTracked(ctx, tx.number, 0, 0, size * 0.02, 'center', 'stroke');
    ctx.restore();
  }

  ctx.save();
  ctx.translate(0, env.oy);
  const cx = W / 2;
  if (tx.eyebrow) {
    const size = fitFontSize(ctx, typo.eyebrow, tx.eyebrow, 30 * u, W * 0.7, 0.5);
    const a1 = easeOutCubic(prog(tt, 1.0 * k, 2.2 * k));
    setFont(ctx, typo.eyebrow, size);
    ctx.globalAlpha = a1;
    ctx.fillStyle = gold.accentSolid;
    drawTracked(ctx, tx.eyebrow, cx, 450 * u, size * lerp(0.9, 0.5, easeOutQuart(a1)));
  }
  if (tx.title) {
    const size = fitFontSize(ctx, typo.title, tx.title, 94 * u, W * 0.86, 0.08);
    const a2 = easeOutCubic(prog(tt, 1.5 * k, 3.0 * k));
    setFont(ctx, typo.title, size);
    ctx.save();
    ctx.globalAlpha = a2;
    const trk2 = size * lerp(0.3, 0.06, easeOutQuart(prog(tt, 1.5 * k, 4.5 * k)));
    const tw2 = measureTracked(ctx, tx.title, trk2);
    withBlur(ctx, a2 < 1 ? 10 * u * (1 - a2) : 0, cx - tw2 / 2 - 50 * u, 575 * u - size - 40 * u, tw2 + 100 * u, size * 1.4 + 80 * u, (g) => {
      setFont(g, typo.title, size);
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = 24 * u;
      g.fillStyle = '#fbf8f1';
      drawTracked(g, tx.title, cx, 575 * u, trk2);
    });
    ctx.restore();
  }
  const lg = easeInOutCubic(prog(tt, 2.6 * k, 3.8 * k));
  if (lg > 0) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = gold.accentSolid;
    ctx.fillRect(cx - 130 * u * lg, 622 * u, 260 * u * lg, Math.max(1, 1.5 * u));
  }
  if (tx.subtitle) {
    const a3 = easeOutCubic(prog(tt, 3.1 * k, 4.2 * k));
    const size = fitFontSize(ctx, typo.display, tx.subtitle, 32 * u, W * 0.7, 0.3);
    setFont(ctx, typo.display, size);
    ctx.globalAlpha = a3;
    ctx.fillStyle = gold.accentSolid;
    drawTracked(ctx, tx.subtitle, cx, 685 * u, size * 0.3);
  }
  if (tx.org) {
    const a4 = easeOutCubic(prog(tt, 3.6 * k, 4.7 * k));
    const size = fitFontSize(ctx, typo.body, tx.org, 28 * u, W * 0.7, 0.15);
    setFont(ctx, typo.body, size);
    ctx.globalAlpha = a4;
    ctx.fillStyle = 'rgba(251,248,241,0.75)';
    drawTracked(ctx, tx.org, cx, 750 * u, size * 0.15);
  }
  ctx.restore();

  // 레터박스: 화면 가운데서 위아래로 열림 (2.39:1 시네마 비율)
  const finalBar = W / H > 1.3 ? Math.max(0, (H - W / 2.39) / 2) : H * 0.07;
  const open = easeInOutCubic(prog(tau, 0.2, 2.0));
  const bar = lerp(H / 2, finalBar, open);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, bar);
  ctx.fillRect(0, H - bar, W, bar);
}

/** 폴라로이드: 인화 사진이 차례로 떨어져 쌓인 뒤 타이틀 */
function drawIntroPolaroid(ctx, seg, tau, env) {
  const { W, H, u, theme, tl } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  drawThemeBackground(ctx, W, H, theme, tau, 0.7);
  const photos = tl.gallery;
  const n = 7;
  const r = rng(hashStr('polaroid'));
  const S = Math.min(W, H);
  const cardW = S * 0.34;
  const pad = cardW * 0.06;
  const imgW = cardW - pad * 2;
  const cardH = pad + imgW + cardW * 0.22;
  const p = clamp(tau / seg.dur);
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.03);
  // 타이틀이 놓일 중앙을 피해 좌우(가로 화면) 또는 위아래(세로 화면)에 배치
  const angs = W >= H ? [150, 185, 220, 325, 0, 35, 255] : [60, 90, 120, 240, 270, 300, 20];
  for (let i = 0; i < n; i++) {
    const ang = ((angs[i] + (r() - 0.5) * 14) * Math.PI) / 180;
    const rx = W >= H ? W * 0.37 : W * 0.3;
    const ry = W >= H ? H * 0.32 : H * 0.36;
    const cx = W / 2 + Math.cos(ang) * rx * (0.9 + r() * 0.2);
    const cy = H / 2 + Math.sin(ang) * ry * (0.9 + r() * 0.2);
    const rot = (r() - 0.5) * 0.5;
    const t0 = (0.2 + i * 0.4) * k * IT.pp;
    const e = prog(tau, t0, t0 + 0.75);
    if (e <= 0) continue;
    const land = easeOutCubic(e);
    const sc = lerp(1.5, 1, land) * (1 + 0.02 * Math.sin(Math.min(1, e) * Math.PI));
    const drop = (1 - land) * -H * 0.12;
    ctx.save();
    ctx.translate(cx + drift(i, p) * u, cy + drop);
    ctx.rotate(rot + (1 - land) * 0.25);
    ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, e * 2.5);
    ctx.shadowColor = `rgba(0,0,0,${0.18 + 0.22 * land})`;
    ctx.shadowBlur = lerp(60, 26, land) * u;
    ctx.shadowOffsetY = lerp(40, 12, land) * u;
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
    ctx.shadowColor = 'transparent';
    const ph = photos.length ? photos[i % photos.length] : null;
    const a = ph ? env.assets.getThumb(itemKey(ph)) : null;
    const ix = -cardW / 2 + pad;
    const iy = -cardH / 2 + pad;
    if (a && !a.failed) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, iy, imgW, imgW);
      ctx.clip();
      drawCover(ctx, a.img, a.w, a.h, ix, iy, imgW, imgW);
      ctx.restore();
    } else {
      const gg = ctx.createLinearGradient(ix, iy, ix + imgW, iy + imgW);
      gg.addColorStop(0, theme.bg[1]);
      gg.addColorStop(1, theme.accent[2]);
      ctx.fillStyle = gg;
      ctx.fillRect(ix, iy, imgW, imgW);
    }
    ctx.fillStyle = 'rgba(255,240,215,0.08)';
    ctx.fillRect(ix, iy, imgW, imgW);
    ctx.restore();
  }
  ctx.restore();
  // 중앙 타이틀 영역
  const s = IT.s;
  const panel = easeInOutSine(prog(tau, s - 0.4, s + 0.8)) * Math.min(1, (IT.dim == null ? 0.62 : IT.dim) / 0.62);
  if (panel > 0) {
    ctx.save();
    ctx.globalAlpha = panel;
    const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.42);
    rg.addColorStop(0, rgba(theme.bg[1], 0.94));
    rg.addColorStop(0.55, rgba(theme.bg[1], 0.8));
    rg.addColorStop(1, rgba(theme.bg[1], 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  drawLockup(ctx, env, tau, s, k * 0.85);
  bgFadeIn(ctx, env, tau, 0.6);
}

function drift(i, p) {
  return Math.sin(i * 1.7 + p * 2) * 10;
}

/** 플로럴 블룸: 부드러운 색 번짐 + 흩날리는 꽃잎 */
function drawIntroBloom(ctx, seg, tau, env) {
  const { W, H, u, theme } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  drawThemeBackground(ctx, W, H, theme, tau, 1.1);
  const S = Math.max(W, H);
  ctx.save();
  ctx.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
  const cols = [theme.particle, theme.accent[2], theme.accent[3]];
  for (let i = 0; i < 5; i++) {
    const x = W * (0.5 + 0.38 * Math.sin(tau * 0.11 + i * 1.9));
    const y = H * (0.5 + 0.34 * Math.cos(tau * 0.09 + i * 2.4));
    const rad = S * (0.28 + 0.08 * i);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(cols[i % 3], theme.dark ? 0.1 : 0.2));
    g.addColorStop(1, rgba(cols[i % 3], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  drawBokeh(ctx, W, H, tau + 2, { seed: 'bloom', discs: 20, sparks: 46, color: theme.particle, alpha: theme.dark ? 0.9 : 0.8, blurDiscs: true });
  drawPetals(ctx, env, tau, 28, easeOutCubic(prog(tau, 0, 2)));
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.03);
  drawLockup(ctx, env, tau, 0.6 * k, k);
  ctx.restore();
  bgFadeIn(ctx, env, tau, 1.2);
}

function drawPetals(ctx, env, t, count, alpha) {
  const { W, H, u, theme } = env;
  const r = rng(hashStr('petals'));
  const [cr, cg, cb] = hexToRgb(theme.particle);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x0 = r() * W;
    const y0 = r() * H;
    const sz = (12 + r() * 20) * u;
    const vy = (28 + r() * 40) * u;
    const sway = (20 + r() * 50) * u;
    const w = 0.4 + r() * 0.8;
    const ph = r() * Math.PI * 2;
    const spin = (r() - 0.5) * 2;
    const depth = 0.5 + r() * 0.5;
    const y = ((((y0 + vy * t) % (H + 80 * u)) + H + 80 * u) % (H + 80 * u)) - 40 * u;
    const x = x0 + Math.sin(t * w + ph) * sway;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ph + t * spin);
    ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(t * w * 1.3 + ph)));
    ctx.globalAlpha = alpha * depth * 0.85;
    const g = ctx.createLinearGradient(-sz, 0, sz, 0);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},0.95)`);
    g.addColorStop(1, `rgba(255,255,255,0.75)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-sz, 0);
    ctx.bezierCurveTo(-sz * 0.4, -sz * 0.7, sz * 0.5, -sz * 0.55, sz, 0);
    ctx.bezierCurveTo(sz * 0.5, sz * 0.55, -sz * 0.4, sz * 0.7, -sz, 0);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** 미니멀 라인: 가로선이 그어지고 글자가 선 위/아래로 솟아남 */
function drawIntroMinimal(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  const tx = project.text;
  drawThemeBackground(ctx, W, H, theme, tau, 0.35);
  const cx = W / 2;
  const cy = 540 * u;
  ctx.save();
  pushIn(ctx, env, tau, seg.dur, 0.025);
  ctx.translate(0, env.oy);
  const lw = Math.min(W * 0.7, 1100 * u) * easeInOutCubic(prog(tau, 0.3 * k, 1.6 * k));
  ctx.fillStyle = theme.accentSolid;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(cx - lw / 2, cy - 0.75 * u, lw, Math.max(1, 1.5 * u));
  ctx.globalAlpha = 1;
  // 선 위: 숫자 + 아이브로우 (아래에서 위로 솟아오름)
  const eUp = easeOutQuart(prog(tau, 1.2 * k, 2.5 * k));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy - 340 * u, W, 338 * u);
  ctx.clip();
  ctx.translate(0, (1 - eUp) * 150 * u);
  if (tx.eyebrow) {
    const size = fitFontSize(ctx, typo.eyebrow, tx.eyebrow, 30 * u, W * 0.7, 0.4);
    setFont(ctx, typo.eyebrow, size);
    ctx.fillStyle = theme.textDim;
    drawTracked(ctx, tx.eyebrow, cx, cy - 36 * u, size * 0.4);
  }
  if (tx.number) {
    const size = fitFontSize(ctx, typo.display, tx.number, 170 * u, W * 0.7, 0.02);
    setFont(ctx, typo.display, size);
    ctx.fillStyle = accentGradient(ctx, theme, cy - 90 * u - size * 0.75, cy - 90 * u);
    drawTracked(ctx, tx.number, cx, cy - 92 * u, size * 0.02);
  }
  ctx.restore();
  // 선 아래: 타이틀 (위에서 아래로 내려옴)
  const eDn = easeOutQuart(prog(tau, 1.6 * k, 2.9 * k));
  if (tx.title) {
    const size = fitFontSize(ctx, typo.title, tx.title, 80 * u, W * 0.86, 0.02);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, cy + 2 * u, W, 160 * u);
    ctx.clip();
    ctx.translate(0, (1 - eDn) * -130 * u);
    setFont(ctx, typo.title, size);
    ctx.fillStyle = theme.text;
    drawTracked(ctx, tx.title, cx, cy + 108 * u, size * 0.02);
    ctx.restore();
  }
  const a3 = easeOutCubic(prog(tau, 2.8 * k, 3.9 * k));
  if (tx.subtitle && a3 > 0) {
    const size = fitFontSize(ctx, typo.display, tx.subtitle, 30 * u, W * 0.7, 0.25);
    setFont(ctx, typo.display, size);
    ctx.globalAlpha = a3;
    ctx.fillStyle = theme.accentSolid;
    drawTracked(ctx, tx.subtitle, cx, cy + 185 * u, size * 0.25);
  }
  const a4 = easeOutCubic(prog(tau, 3.3 * k, 4.4 * k));
  if (tx.org && a4 > 0) {
    const size = fitFontSize(ctx, typo.body, tx.org, 26 * u, W * 0.7, 0.12);
    setFont(ctx, typo.body, size);
    ctx.globalAlpha = a4;
    ctx.fillStyle = theme.textDim;
    drawTracked(ctx, tx.org, cx, cy + 245 * u, size * 0.12);
  }
  ctx.restore();
  const logo = tx.logo ? env.assets.getThumb(tx.logo) : null;
  if (logo && !logo.failed && a4 > 0) {
    const lh = 60 * u;
    const lw2 = Math.min(W * 0.3, (logo.w / logo.h) * lh);
    const hh = (lw2 / logo.w) * logo.h;
    ctx.save();
    ctx.globalAlpha = a4;
    ctx.drawImage(logo.img, cx - lw2 / 2, H - 120 * u - hh / 2, lw2, hh);
    ctx.restore();
  }
  bgFadeIn(ctx, env, tau, 0.8);
}

/** 필름 카운트다운: 3·2·1 영사기 리더 → 섬광 → 타이틀 */
function drawIntroFilmLeader(ctx, seg, tau, env) {
  const { W, H, u, theme, typo } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  const cd = 3.3 * Math.min(1, k);
  if (tau < cd) {
    const frame = Math.floor(tau * 24);
    const fr = rng(hashStr('leader' + frame));
    const jx = (fr() - 0.5) * 4 * u;
    const jy = (fr() - 0.5) * 4 * u;
    ctx.fillStyle = '#b8aa8f';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(jx, jy);
    const S = Math.min(W, H);
    const cx = W / 2;
    const cy = H / 2;
    const f = tau / (cd / 3);
    const num = 3 - Math.min(2, Math.floor(f));
    const frac = f % 1;
    // 시계 방향 스윕
    ctx.fillStyle = 'rgba(60,48,32,0.28)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2b241a';
    ctx.lineWidth = Math.max(1, 3 * u);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(W, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 5 * u);
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 3 * u);
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.32, 0, Math.PI * 2);
    ctx.stroke();
    setFont(ctx, typo.display, S * 0.42);
    ctx.fillStyle = '#1d1810';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(String(num), cx, cy + S * 0.02);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    // 먼지·스크래치·깜빡임
    ctx.save();
    ctx.strokeStyle = 'rgba(30,24,16,0.45)';
    ctx.lineWidth = Math.max(1, 1.2 * u);
    for (let i = 0; i < 3; i++) {
      if (fr() < 0.5) continue;
      const x = fr() * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (fr() - 0.5) * 20 * u, H);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(25,20,12,0.6)';
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc(fr() * W, fr() * H, (0.8 + fr() * 2.5) * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(0,0,0,${(fr() * 0.12).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,14,6,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  drawThemeBackground(ctx, W, H, theme, tau, 1);
  drawBokeh(ctx, W, H, tau, { seed: 'leader', discs: 16, sparks: 40, color: theme.particle, alpha: theme.dark ? 0.8 : 0.5 });
  ctx.save();
  pushIn(ctx, env, tau - cd, seg.dur - cd, 0.03);
  drawLockup(ctx, env, tau, cd + 0.3, k * 0.85);
  ctx.restore();
  const fl = 1 - easeOutCubic(prog(tau, cd, cd + 0.6));
  if (fl > 0) {
    ctx.save();
    ctx.globalAlpha = fl;
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// =====================================================================
// 엔딩 크레딧: 영화처럼 올라가는 이름 목록 → 마무리 타이틀
//   형식: "# 제목" = 섹션 제목, "역할<Tab>이름" 또는 "역할 : 이름" = 2단, 빈 줄 = 간격
// =====================================================================
export function parseCredits(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      out.push({ t: 'gap' });
      continue;
    }
    if (line.startsWith('#')) {
      out.push({ t: 'h', a: line.replace(/^#+\s*/, '') });
      continue;
    }
    const m = raw.split(/\t|\s{2,}|\s:\s|:\s/);
    if (m.length >= 2 && m[0].trim() && m.slice(1).join(' ').trim()) out.push({ t: 'pair', a: m[0].trim(), b: m.slice(1).join(' ').trim() });
    else out.push({ t: 'line', a: line });
  }
  return out;
}

function drawOutroCredits(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project } = env;
  const tx = project.text;
  drawThemeBackground(ctx, W, H, theme, tau, 0.6);
  drawBokeh(ctx, W, H, tau, { seed: 'credits', discs: 10, sparks: 36, color: theme.particle, alpha: theme.dark ? 0.7 : 0.4 });
  let lines = parseCredits(tx.credits);
  if (!lines.some((l) => l.t !== 'gap')) lines = parseCredits((tx.closingMessage || '').replace(/\n/g, '\n'));
  const HH = { h: 86, pair: 56, line: 56, gap: 44 };
  const contentH = lines.reduce((s, l) => s + HH[l.t], 0) * u;
  const s0 = seg.tIn * 0.4;
  const s1 = Math.max(s0 + 3, seg.dur * 0.62);
  const sp = prog(tau, s0, s1);
  const y0 = lerp(H + 20 * u, -contentH - 20 * u, sp);
  const cx = W / 2;
  if (sp < 1) {
    let y = y0;
    for (const l of lines) {
      const h = HH[l.t] * u;
      if (y > -h && y < H + h) {
        if (l.t === 'h') {
          const size = fitFontSize(ctx, typo.eyebrow, l.a, 32 * u, W * 0.8, 0.2);
          setFont(ctx, typo.eyebrow, size, Math.max(500, typo.eyebrow.weight));
          ctx.fillStyle = theme.accentSolid;
          drawTracked(ctx, l.a, cx, y + 54 * u, size * 0.2);
        } else if (l.t === 'pair') {
          setFont(ctx, typo.body, fitFontSize(ctx, typo.body, l.a, 28 * u, W * 0.4 - 30 * u, 0.02));
          ctx.fillStyle = theme.textDim;
          drawTracked(ctx, l.a, cx - 22 * u, y + 38 * u, 1 * u, 'right');
          const size = fitFontSize(ctx, typo.title, l.b, 34 * u, W * 0.42, 0.02);
          setFont(ctx, typo.title, size);
          ctx.fillStyle = theme.text;
          drawTracked(ctx, l.b, cx + 22 * u, y + 38 * u, size * 0.02, 'left');
        } else if (l.t === 'line') {
          const size = fitFontSize(ctx, typo.title, l.a, 34 * u, W * 0.86, 0.02);
          setFont(ctx, typo.title, size);
          ctx.fillStyle = theme.text;
          drawTracked(ctx, l.a, cx, y + 38 * u, size * 0.02);
        }
      }
      y += h;
    }
    // 위아래 페이드 마스크
    for (const [ya, yb] of [[0, H * 0.18], [H, H * 0.82]]) {
      const g = ctx.createLinearGradient(0, ya, 0, yb);
      g.addColorStop(0, theme.bg[0]);
      g.addColorStop(1, rgba(theme.bg[0], 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.min(ya, yb), W, Math.abs(yb - ya));
    }
  }
  // 마무리 타이틀
  const a = easeOutCubic(prog(tau, s1 - 0.4, s1 + 1.2));
  if (a > 0) {
    ctx.save();
    ctx.translate(0, env.oy);
    if (tx.closingTitle) {
      const size = fitFontSize(ctx, typo.title, tx.closingTitle, 104 * u, W * 0.84, 0.04);
      setFont(ctx, typo.title, size);
      ctx.fillStyle = accentGradient(ctx, theme, 540 * u - size * 0.8, 540 * u + size * 0.1);
      drawCharsReveal(ctx, tx.closingTitle, cx, 545 * u, { t: tau, start: s1 - 0.4, stagger: 0.07, dur: 1.0, rise: 20 * u, tracking: size * 0.04, blur: 6 * u });
    }
    if (tx.closingSub) {
      const size = fitFontSize(ctx, typo.title, tx.closingSub, 32 * u, W * 0.8, 0.08);
      setFont(ctx, typo.title, size);
      ctx.globalAlpha = easeOutCubic(prog(tau, s1 + 0.6, s1 + 1.8));
      ctx.fillStyle = theme.accentSolid;
      drawTracked(ctx, tx.closingSub, cx, 625 * u, size * 0.08);
    }
    if (tx.org) {
      const size = fitFontSize(ctx, typo.eyebrow, tx.org, 28 * u, W * 0.7, 0.24);
      setFont(ctx, typo.eyebrow, size, Math.max(500, typo.eyebrow.weight));
      ctx.globalAlpha = easeOutCubic(prog(tau, s1 + 1.0, s1 + 2.2));
      ctx.fillStyle = theme.textDim;
      drawTracked(ctx, tx.org, cx, 720 * u, size * 0.24);
    }
    ctx.restore();
  }
  fadeToBlack(ctx, env, tau, seg.dur);
}

// =====================================================================
// 임팩트 인트로 2종
// =====================================================================

/** 흑백 썸네일 (한 번만 만들어 캐시) */
function grayThumb(env, ph) {
  const a = env.assets.getThumb(itemKey(ph));
  if (!a || a.failed) return null;
  const key = `gray|${itemKey(ph)}|${a.w}`;
  let g = env.cache.get(key);
  if (!g) {
    const c = new OffscreenCanvas(a.w, a.h);
    const x = c.getContext('2d');
    x.filter = 'grayscale(1) contrast(1.15) brightness(0.92)';
    x.drawImage(a.img, 0, 0);
    g = { img: c.transferToImageBitmap(), w: a.w, h: a.h };
    env.cache.set(key, g);
  }
  return g;
}

/** 타임 롤: 흑백 사진 기둥이 세로로 빠르게 흐르며 연도가 올라가고, 멈추는 순간 색이 돌아오며 타이틀 */
function drawIntroTimeRoll(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project, tl } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  const s = IT.s;
  const tx = project.text;
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);
  const photos = tl.gallery;
  const rushEnd = Math.max(0.8, s - 0.15 * k);
  const p = clamp(tau / rushEnd);
  const D = H * 9 * Math.max(0.6, IT.pp);
  const offset = D * easeOutCubic(p) + 30 * u * tau;
  const vel = (D * 3 * Math.pow(1 - p, 2)) / rushEnd; // px/s
  const blurLen = Math.min(H * 0.25, vel / 30);
  const color = easeOutCubic(prog(tau, s - 0.1 * k, s + 1.4 * k));
  if (photos.length) {
    const cols = W >= H ? 5 : 3;
    const gap = 10 * u;
    const colW = (W - gap * (cols + 1)) / cols;
    const tileH = colW * 0.78;
    const step = tileH + gap;
    for (let c = 0; c < cols; c++) {
      const dir = c % 2 ? 1 : -1;
      const speed = 0.85 + 0.12 * ((c * 37) % 3);
      const off = offset * speed * dir;
      const x = gap + c * (colW + gap);
      const first = Math.floor(-off / step) - 1;
      for (let j = first; j * step + off < H + step; j++) {
        const y = j * step + off;
        if (y + tileH < -blurLen || y > H + blurLen) continue;
        const ph = photos[(((j + c * 7) % photos.length) + photos.length) % photos.length];
        const gimg = grayThumb(env, ph);
        const cimg = env.assets.getThumb(itemKey(ph));
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, Math.max(-blurLen, y - blurLen / 2), colW, tileH + blurLen);
        ctx.clip();
        if (gimg) {
          if (blurLen > 4 * u) {
            // 빠를 때는 세로 잔상(모션 블러)
            for (const [o, al] of [[-0.5, 0.35], [0, 0.5], [0.5, 0.35]]) {
              ctx.globalAlpha = al;
              drawCover(ctx, gimg.img, gimg.w, gimg.h, x, y + o * blurLen, colW, tileH);
            }
            ctx.globalAlpha = 1;
          } else drawCover(ctx, gimg.img, gimg.w, gimg.h, x, y, colW, tileH);
          if (color > 0.01 && cimg && !cimg.failed) {
            ctx.globalAlpha = color * 0.9;
            drawCover(ctx, cimg.img, cimg.w, cimg.h, x, y, colW, tileH);
            ctx.globalAlpha = 1;
          }
        } else {
          ctx.fillStyle = '#222';
          ctx.fillRect(x, y, colW, tileH);
        }
        ctx.restore();
      }
    }
  }
  // 글자를 위한 어둡게 (빠르게 흐를 때는 약하게)
  const dimA = IT.dim == null ? 0.62 : IT.dim;
  ctx.fillStyle = `rgba(0,0,0,${lerp(0.3, dimA, easeInOutSine(prog(tau, s - 0.8 * k, s + 0.5 * k))).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // 흐르는 연도 카운터
  const y0 = parseInt(tx.startYear, 10);
  const y1 = parseInt(tx.endYear, 10);
  const valid = isFinite(y0) && isFinite(y1) && y1 > y0 && y1 - y0 < 500;
  const ca = easeOutCubic(prog(tau, 0.15, 0.6)) * (1 - easeInOutSine(prog(tau, s - 0.35 * k, s + 0.15 * k)));
  if (ca > 0.01) {
    const label = valid ? String(Math.round(lerp(y0, y1, easeOutCubic(p)))) : tx.number || '';
    if (label) {
      ctx.save();
      ctx.globalAlpha = ca;
      const size = 250 * u;
      setFont(ctx, typo.display, size);
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 30 * u;
      ctx.fillStyle = '#ffffff';
      drawTracked(ctx, label, W / 2, H / 2 + env.oy * 0, size * 0.04);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = theme.dark ? theme.accentSolid : captionAccent(theme).solid;
      const lw = 360 * u * easeOutCubic(p);
      ctx.fillRect(W / 2 - lw / 2, H / 2 + size * 0.48, lw, Math.max(1, 2 * u));
      ctx.restore();
    }
  }
  // 멈추는 순간 섬광
  const fl = 1 - easeOutCubic(prog(tau, s - 0.12 * k, s + 0.45));
  if (fl > 0 && tau > s - 0.12 * k) {
    ctx.fillStyle = `rgba(255,250,240,${(fl * 0.85).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.save();
  pushIn(ctx, env, Math.max(0, tau - s), Math.max(1, seg.dur - s), 0.03);
  drawLockup(ctx, env, tau, s, k, { onPhoto: true, darkBg: true, textColor: '#fbf8f1', textDim: 'rgba(251,248,241,0.75)' });
  ctx.restore();
  blackFadeIn(ctx, env, tau, 0.45);
}

/** 플래시 컷: 사진이 점점 빨라지며 번쩍이듯 교차하고, 큰 글자가 사이사이 꽂힌 뒤 타이틀 */
function flashSchedule(n, s, k) {
  const cuts = [];
  let t = 0.1;
  let i = 0;
  const end = s - 0.25 * k;
  while (t < end && n > 0) {
    const d = lerp(0.5, 0.12, clamp(t / end));
    cuts.push({ t, d: Math.min(d, end - t), i: i % n });
    t += d;
    i++;
  }
  return cuts;
}

function drawIntroFlashCut(ctx, seg, tau, env) {
  const { W, H, u, theme, typo, project, tl } = env;
  const IT = introT(env, seg);
  const k = IT.k;
  const s = IT.s;
  const tx = project.text;
  const photos = tl.gallery.slice(0, 10);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const words = [tx.number, ...String(tx.eyebrow || '').split(/\s+/)].map((w) => (w || '').trim()).filter(Boolean).slice(0, 3);
  const wordAt = words.map((_, i) => s * (0.3 + (i * 0.5) / Math.max(1, words.length)));
  const wd = 0.38 * k;
  const activeWord = wordAt.findIndex((t0) => tau >= t0 && tau < t0 + wd);
  if (tau < s) {
    if (activeWord >= 0) {
      // 큰 글자 쾅
      const t0 = wordAt[activeWord];
      const e = easeOutCubic(prog(tau, t0, t0 + 0.18));
      const word = words[activeWord];
      const size = fitFontSize(ctx, typo.display, word, 300 * u, W * 0.86, 0.06);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      const sc = lerp(1.5, 1, e);
      ctx.scale(sc, sc);
      setFont(ctx, typo.display, size, Math.max(600, typo.display.weight));
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = e;
      ctx.fillStyle = accentGradient(ctx, theme.dark ? theme : { ...theme, accent: captionAccent(theme).accent }, -size * 0.5, size * 0.5);
      drawTracked(ctx, word, 0, 0, size * 0.06);
      ctx.restore();
    } else if (photos.length) {
      const cuts = flashSchedule(photos.length, s, k);
      let cur = null;
      for (const c of cuts) if (tau >= c.t) cur = c;
      if (cur) {
        const a = env.assets.get(itemKey(photos[cur.i]));
        const q = clamp((tau - cur.t) / Math.max(0.05, cur.d));
        if (a && !a.failed) {
          ctx.save();
          const r = ((cur.i * 53) % 7) - 3;
          ctx.translate(W / 2, H / 2);
          ctx.rotate((r * Math.PI) / 900);
          ctx.translate(-W / 2, -H / 2);
          drawCover(ctx, a.img, a.w, a.h, 0, 0, W, H, lerp(1.2, 1.06, easeOutCubic(q)), 0.5, 0.42);
          ctx.restore();
        }
        // 컷마다 번쩍
        const f = 1 - easeOutCubic(clamp((tau - cur.t) / 0.09));
        if (f > 0) {
          ctx.fillStyle = `rgba(255,255,255,${(f * 0.6).toFixed(3)})`;
          ctx.fillRect(0, 0, W, H);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, 0, W, H);
      }
    }
  } else {
    // 타이틀: 마지막 사진을 흐리게 깔고
    const last = photos[photos.length - 1];
    const a = last ? env.assets.get(itemKey(last)) : null;
    if (a && !a.failed && a.bg) {
      ctx.imageSmoothingQuality = 'low';
      drawCover(ctx, a.bg, a.bg.width, a.bg.height, 0, 0, W, H, lerp(1.25, 1.12, easeOutCubic(prog(tau, s, seg.dur))));
      ctx.imageSmoothingQuality = 'high';
    } else drawThemeBackground(ctx, W, H, theme, tau, 0.6);
    const dimA = IT.dim == null ? 0.62 : IT.dim;
    ctx.fillStyle = `rgba(0,0,0,${dimA})`;
    ctx.fillRect(0, 0, W, H);
    drawBokeh(ctx, W, H, tau, { seed: 'flash', discs: 10, sparks: 30, color: theme.particle, alpha: 0.6 });
    const fl = 1 - easeOutCubic(prog(tau, s, s + 0.5));
    if (fl > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(fl * 0.9).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    pushIn(ctx, env, tau - s, Math.max(1, seg.dur - s), 0.03);
    drawLockup(ctx, env, tau, s + 0.1, k, { onPhoto: true, darkBg: true, textColor: '#fbf8f1', textDim: 'rgba(251,248,241,0.75)' });
    ctx.restore();
  }
}

/** 캡션용 금색: 밝은 테마여도 사진 위에서는 밝은 금색 사용 */
export function captionAccent(theme) {
  if (theme.dark) return { accent: theme.accent, solid: theme.accentSolid };
  return { accent: ['#8a6424', '#d2ac57', '#f3dea0', '#fff3cf', '#e0bd6a', '#9a7230'], solid: '#e6c977' };
}

export { hexToRgb };
