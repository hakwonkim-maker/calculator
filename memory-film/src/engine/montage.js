// 몽타주 장면: 사진 여러 장을 한 화면에 모아 보여주는 중간 연출 (자동 배치)
//   grid      모자이크 그리드 — 타일이 순서대로 들어오며 각자 천천히 움직임
//   polaroid  폴라로이드 — 인화 사진이 테이블 위로 한 장씩 떨어짐
//   split     분할 패널 — 세로(세로 화면은 가로) 패널이 위아래에서 교차로 밀려 들어옴
//   filmstrip 필름 스트립 — 필름 띠가 가로로 흘러가며 사진이 이어짐
import { drawCover, drawThemeBackground, drawBokeh, rgba } from './draw.js';
import { prog, clamp, lerp, easeOutCubic, easeInOutSine, rng, hashStr } from './math.js';
import { itemKey } from './assets.js';

/** 몽타주에 필요한 에셋: 크게 보이는 스타일은 원본, 작게 보이는 스타일은 썸네일 */
export function montageNeeds(seg) {
  const keys = seg.items.map(itemKey);
  return seg.style === 'grid' || seg.style === 'split' ? { full: keys, thumbs: [] } : { full: [], thumbs: keys };
}

export function drawMontage(ctx, seg, tau, env) {
  const fn = { grid: drawGrid, polaroid: drawPolaroids, split: drawSplit, filmstrip: drawFilmstrip }[seg.style] || drawGrid;
  fn(ctx, seg, tau, env);
}

function asset(env, it, full) {
  const a = full ? env.assets.get(itemKey(it)) : env.assets.getThumb(itemKey(it));
  return a && !a.failed ? a : null;
}

/** 공통 배경: 첫 사진의 흐린 배경 + 테마 톤 */
function backdrop(ctx, seg, tau, env, darken = 0.62) {
  const { W, H, theme } = env;
  const a = env.assets.get(itemKey(seg.items[0]));
  if (a && !a.failed && a.bg) {
    ctx.imageSmoothingQuality = 'low';
    drawCover(ctx, a.bg, a.bg.width, a.bg.height, 0, 0, W, H, 1.15 + 0.05 * clamp(tau / seg.dur));
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = theme.dark ? theme.scrim + `${darken})` : rgba(theme.bg[0], darken + 0.1);
    ctx.fillRect(0, 0, W, H);
  } else {
    drawThemeBackground(ctx, W, H, theme, tau, 0.6);
  }
}

/** i번째 요소가 등장하는 시각: 앞 전환이 거의 끝난 뒤부터 고르게 */
function appearAt(seg, i, n, spread = 0.6) {
  const usable = Math.max(1, seg.dur - seg.tIn - seg.tOut);
  const step = Math.min(0.45, (usable * spread) / Math.max(1, n));
  return seg.tIn * 0.55 + i * step;
}

// ---------------------------------------------------------------- 모자이크 그리드
function gridLayout(n, landscape) {
  // 정규화 좌표 [x, y, w, h]
  let cells;
  if (n <= 4) cells = [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
  else if (n === 5) cells = [[0, 0, 0.5, 1], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]];
  else cells = [[0, 0, 1 / 3, 0.5], [1 / 3, 0, 1 / 3, 0.5], [2 / 3, 0, 1 / 3, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]];
  return landscape ? cells : cells.map(([x, y, w, h]) => [y, x, h, w]);
}

function drawGrid(ctx, seg, tau, env) {
  const { W, H, u, theme } = env;
  ctx.fillStyle = theme.dark ? '#050505' : theme.bg[1];
  ctx.fillRect(0, 0, W, H);
  backdrop(ctx, seg, tau, env, 0.75);
  const n = seg.items.length;
  const cells = gridLayout(n, W >= H);
  const m = 34 * u;
  const gap = 12 * u;
  const p = clamp(tau / seg.dur);
  const zoom = lerp(1.04, 1.0, easeOutCubic(p));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
  const r = rng(hashStr('grid' + seg.key));
  cells.slice(0, n).forEach(([cx, cy, cw, ch], i) => {
    const x = m + cx * (W - 2 * m) + gap / 2;
    const y = m + cy * (H - 2 * m) + gap / 2;
    const w = cw * (W - 2 * m) - gap;
    const h = ch * (H - 2 * m) - gap;
    const t0 = appearAt(seg, i, n);
    const e = easeOutCubic(prog(tau, t0, t0 + 0.7));
    if (e <= 0) return;
    const dir = i % 2 ? 1 : -1;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(x + w / 2 + (1 - e) * dir * 40 * u, y + h / 2);
    const s = lerp(0.9, 1, e);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 6 * u);
    ctx.clip();
    const a = asset(env, seg.items[i], true);
    if (a) {
      // 타일마다 서로 다른 방향으로 천천히 움직임
      const kz = lerp(1.12, 1.02, p) + r() * 0.02;
      drawCover(ctx, a.img, a.w, a.h, -w / 2, -h / 2, w, h, kz, 0.5 + (r() - 0.5) * 0.3 * p, 0.42);
    } else {
      ctx.fillStyle = theme.bg[1];
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  });
  ctx.restore();
}

// ---------------------------------------------------------------- 폴라로이드
const POLA_SLOTS = [
  [-0.27, -0.12, -0.12], [0.25, -0.16, 0.1], [-0.2, 0.2, 0.08], [0.28, 0.18, -0.09], [0.0, 0.02, 0.03], [-0.05, -0.2, -0.05],
];

function drawPolaroids(ctx, seg, tau, env) {
  const { W, H, u, theme } = env;
  drawThemeBackground(ctx, W, H, theme, tau, 0.8);
  drawBokeh(ctx, W, H, tau, { seed: 'pm' + seg.key, discs: 8, sparks: 22, color: theme.particle, alpha: theme.dark ? 0.6 : 0.4 });
  const n = seg.items.length;
  const S = Math.min(W, H);
  const cardW = S * (W >= H ? 0.42 : 0.5);
  const pad = cardW * 0.06;
  const imgW = cardW - pad * 2;
  const cardH = pad + imgW + cardW * 0.22;
  const sx = W >= H ? W : W * 1.25;
  const sy = W >= H ? H : H * 0.9;
  const p = clamp(tau / seg.dur);
  ctx.save();
  const z = lerp(1.0, 1.05, easeInOutSine(p));
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-W / 2, -H / 2);
  for (let i = 0; i < n; i++) {
    const [nx, ny, rot] = POLA_SLOTS[i % POLA_SLOTS.length];
    const t0 = appearAt(seg, i, n, 0.55);
    const e = prog(tau, t0, t0 + 0.7);
    if (e <= 0) continue;
    const land = easeOutCubic(e);
    const cx = W / 2 + nx * sx;
    const cy = H / 2 + ny * sy + (1 - land) * -H * 0.12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot + (1 - land) * 0.3);
    const sc = lerp(1.45, 1, land);
    ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, e * 2.5);
    ctx.shadowColor = `rgba(0,0,0,${0.2 + 0.2 * land})`;
    ctx.shadowBlur = lerp(50, 22, land) * u;
    ctx.shadowOffsetY = lerp(34, 10, land) * u;
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
    ctx.shadowColor = 'transparent';
    const a = asset(env, seg.items[i], false);
    const ix = -cardW / 2 + pad;
    const iy = -cardH / 2 + pad;
    if (a) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(ix, iy, imgW, imgW);
      ctx.clip();
      drawCover(ctx, a.img, a.w, a.h, ix, iy, imgW, imgW, 1.02, 0.5, 0.4);
      ctx.restore();
    } else {
      ctx.fillStyle = theme.bg[1];
      ctx.fillRect(ix, iy, imgW, imgW);
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 분할 패널
function drawSplit(ctx, seg, tau, env) {
  const { W, H, u, theme } = env;
  ctx.fillStyle = theme.dark ? '#000' : theme.bg[0];
  ctx.fillRect(0, 0, W, H);
  const n = seg.items.length;
  const land = W >= H;
  const gap = 10 * u;
  const p = clamp(tau / seg.dur);
  for (let i = 0; i < n; i++) {
    const t0 = appearAt(seg, i, n, 0.4);
    const e = easeOutCubic(prog(tau, t0, t0 + 0.85));
    if (e <= 0) continue;
    const dir = i % 2 ? 1 : -1;
    let x, y, w, h;
    if (land) {
      w = (W - gap * (n - 1)) / n;
      h = H;
      x = i * (w + gap);
      y = (1 - e) * dir * H;
    } else {
      w = W;
      h = (H - gap * (n - 1)) / n;
      x = (1 - e) * dir * W;
      y = i * (h + gap);
    }
    const a = asset(env, seg.items[i], true);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (a) {
      // 패널 안에서 서로 반대 방향으로 천천히 흐름 (패럴랙스)
      const drift = (i % 2 ? 1 : -1) * (p - 0.5) * 0.25;
      drawCover(ctx, a.img, a.w, a.h, x, y, w, h, 1.12, land ? 0.5 : 0.5 + drift, land ? 0.45 + drift : 0.42);
    } else {
      ctx.fillStyle = theme.bg[1];
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 필름 스트립
function drawFilmstrip(ctx, seg, tau, env) {
  const { W, H, u, theme } = env;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d0b09');
  g.addColorStop(0.5, '#1b1712');
  g.addColorStop(1, '#0d0b09');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawBokeh(ctx, W, H, tau, { seed: 'fs' + seg.key, discs: 6, sparks: 16, color: theme.particle, alpha: 0.35 });
  const n = seg.items.length;
  const S = Math.min(W, H);
  const stripH = Math.min(H * 0.62, S * 0.62);
  const border = stripH * 0.13;
  const frameH = stripH - border * 2;
  const frameW = frameH * 1.4;
  const fgap = frameH * 0.08;
  const totalW = n * (frameW + fgap) + fgap;
  const p = clamp((tau - seg.tIn * 0.3) / Math.max(0.1, seg.dur - seg.tIn * 0.3));
  // 오른쪽에서 들어와 왼쪽으로 흘러감 (속도 일정 → 끝까지 부드럽게)
  const x0 = lerp(W * 0.55, W * 0.45 - totalW, p);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.05);
  ctx.translate(-W / 2, -H / 2);
  const y0 = (H - stripH) / 2;
  ctx.fillStyle = '#16120e';
  ctx.fillRect(x0 - W, y0, totalW + W * 2, stripH);
  // 스프로킷 구멍
  ctx.fillStyle = '#2c251c';
  const hole = border * 0.46;
  const step = hole * 2.1;
  const startX = x0 - W + (((x0 % step) + step) % step);
  for (let hx = startX; hx < x0 + totalW + W; hx += step) {
    ctx.beginPath();
    ctx.roundRect(hx, y0 + (border - hole) / 2, hole * 1.15, hole, hole * 0.25);
    ctx.roundRect(hx, y0 + stripH - border + (border - hole) / 2, hole * 1.15, hole, hole * 0.25);
    ctx.fill();
  }
  for (let i = 0; i < n; i++) {
    const fx = x0 + fgap + i * (frameW + fgap);
    if (fx > W * 1.2 || fx + frameW < -W * 0.2) continue;
    const a = asset(env, seg.items[i], false);
    ctx.save();
    ctx.beginPath();
    ctx.rect(fx, y0 + border, frameW, frameH);
    ctx.clip();
    if (a) drawCover(ctx, a.img, a.w, a.h, fx, y0 + border, frameW, frameH, 1.03, 0.5, 0.42);
    else {
      ctx.fillStyle = '#2a241c';
      ctx.fillRect(fx, y0 + border, frameW, frameH);
    }
    ctx.fillStyle = 'rgba(255,230,190,0.06)';
    ctx.fillRect(fx, y0 + border, frameW, frameH);
    ctx.restore();
  }
  ctx.restore();
  // 양끝 어둡게
  for (const [xa, xb] of [[0, W * 0.16], [W, W * 0.84]]) {
    const gg = ctx.createLinearGradient(xa, 0, xb, 0);
    gg.addColorStop(0, 'rgba(0,0,0,0.75)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(Math.min(xa, xb), 0, Math.abs(xb - xa), H);
  }
}
