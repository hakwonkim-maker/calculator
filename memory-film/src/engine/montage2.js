// 몽타주 장면 추가 6종 (상용 편집기의 콜라주·전시·연표 연출을 참고)
//   scrapbook 스크랩북   — 크라프트지 위에 흰 테두리 사진을 붙이고 마스킹 테이프·손글씨·낙서
//   stack     카드 스택  — 쌓인 사진 더미에서 맨 위 장이 날아가며 다음 사진이 드러남
//   gallery   갤러리 월  — 전시장 벽에 걸린 액자, 조명이 차례로 켜지고 카메라가 옆으로 이동
//   diagonal  사선 분할  — 비스듬한 조각들이 엇갈려 밀려 들어오고 경계에 빛이 스침
//   bento     벤토 콜라주 — 크고 작은 칸, 한 장을 화면 가득 보여 주다 전체로 빠지며 나머지 등장
//   timeline  연표       — 선이 그어지며 연도 점이 찍히고 사진 카드가 위아래로 솟아오름
// 모두 2~8장을 지원하며 (ctx, seg, tau, env) 에 대한 순수 함수 (결정적)
import { drawCover, drawThemeBackground, drawBokeh, setFont, drawTracked, fitFontSize, accentGradient } from './draw.js';
import { prog, clamp, lerp, easeOutCubic, easeInOutSine, easeInOutCubic, easeOutQuart, rng, hashStr } from './math.js';
import { itemKey } from './assets.js';
import { photoText } from './timeline.js';

const HAND = { family: 'Nanum Pen Script', weight: 400 };

const backOut = (t, k = 1.4) => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);

function asset(env, it, full) {
  const a = full ? env.assets.get(itemKey(it)) : env.assets.getThumb(itemKey(it));
  return a && !a.failed ? a : null;
}

/** 사진 비율 (불러오기 전에는 사진 정보의 가로·세로, 그것도 없으면 4:3) */
function arOf(env, it, full, lo = 0.72, hi = 1.5) {
  const a = asset(env, it, full);
  let ar = 4 / 3;
  if (a) ar = a.w / a.h;
  else if (it.w && it.h) ar = (((Number(it.rotate) || 0) % 180) + 180) % 180 === 90 ? it.h / it.w : it.w / it.h;
  return clamp(ar, lo, hi);
}

function photoOrBlank(ctx, env, it, full, x, y, w, h, zoom = 1.02, fx = 0.5, fy = 0.42) {
  const a = asset(env, it, full);
  if (a) drawCover(ctx, a.img, a.w, a.h, x, y, w, h, zoom, fx, fy);
  else {
    ctx.fillStyle = env.theme.dark ? '#2a2620' : '#d9d2c4';
    ctx.fillRect(x, y, w, h);
  }
}

/** i번째 요소 등장 시각 (montage.js 와 같은 규칙) */
function appearAt(seg, i, n, spread = 0.6) {
  const usable = Math.max(1, seg.dur - seg.tIn - seg.tOut);
  const step = Math.min(0.45, (usable * spread) / Math.max(1, n));
  return seg.tIn * 0.55 + i * step;
}

/** 카드에 쓸 짧은 글자: 라벨 > 날짜 > 폴더 > 연도 (앞 카드와 같으면 생략) */
function cardLabels(items, style) {
  let prev = null;
  return items.map((it) => {
    const t = photoText(it, style);
    const s = t.label || t.date || t.folder || (t.year ? String(t.year) : '');
    const out = s && s !== prev ? s : '';
    prev = s;
    return out;
  });
}

// =====================================================================
// 스크랩북
// =====================================================================
const TAPES = ['rgba(238,204,128,0.8)', 'rgba(164,206,198,0.8)', 'rgba(236,168,160,0.8)', 'rgba(196,186,232,0.8)', 'rgba(244,238,222,0.82)'];

/** 크라프트지 배경 (한 번만 만들어 캐시) */
function kraftPaper(env) {
  const { W, H, u } = env;
  const key = `kraft|${W}x${H}`;
  let c = env.cache.get(key);
  if (c) return c;
  const cv = new OffscreenCanvas(W, H);
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#d2b289');
  gr.addColorStop(1, '#b98f5f');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  const r = rng(hashStr('kraft'));
  // 종이 섬유
  for (let i = 0; i < 2600; i++) {
    const x = r() * W;
    const y = r() * H;
    const len = (4 + r() * 18) * u;
    const ang = r() * Math.PI;
    g.strokeStyle = r() < 0.5 ? `rgba(255,240,215,${0.05 + r() * 0.08})` : `rgba(80,52,25,${0.04 + r() * 0.07})`;
    g.lineWidth = Math.max(0.6, r() * 1.6 * u);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  // 얼룩 반점
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = r() * H;
    const rr = (40 + r() * 160) * u;
    const rg = g.createRadialGradient(x, y, 0, x, y, rr);
    rg.addColorStop(0, `rgba(120,80,40,${0.03 + r() * 0.05})`);
    rg.addColorStop(1, 'rgba(120,80,40,0)');
    g.fillStyle = rg;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // 가장자리 어둡게
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  vg.addColorStop(0, 'rgba(40,24,10,0)');
  vg.addColorStop(1, 'rgba(40,24,10,0.38)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  c = cv.transferToImageBitmap();
  env.cache.set(key, c);
  return c;
}

/** 장수에 맞춰 화면을 칸으로 나눈 자리 (마지막 줄은 가운데 정렬) + 약간의 흐트러짐 */
function looseSlots(n, W, H, m, r) {
  // 화면 비율(가로·세로·정사각형)에 맞춰 사진이 가장 크게 보이는 칸 수를 고름 (인화지 ≈ 4:3 + 아래 여백)
  let cols = 1;
  let best = 0;
  for (let c = 1; c <= n; c++) {
    const rws = Math.ceil(n / c);
    const size = Math.min((W - 2 * m) / c / 1.45, (H - 2 * m) / rws / 1.2);
    if (size > best * 1.04) {
      best = size;
      cols = c;
    }
  }
  const rows = Math.ceil(n / cols);
  const cw = (W - 2 * m) / cols;
  const ch = (H - 2 * m) / rows;
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const cnt = row === rows - 1 ? n - row * cols : cols;
    const off = ((cols - cnt) * cw) / 2;
    out.push({
      x: m + off + (col + 0.5) * cw + (r() - 0.5) * cw * 0.1,
      y: m + (row + 0.5) * ch + (r() - 0.5) * ch * 0.1,
      bw: cw * 0.86,
      bh: ch * 0.84,
      rot: (r() - 0.5) * 0.2,
    });
  }
  return out;
}

function tapePath(ctx, w, h, r) {
  // 양 끝이 톱니처럼 찢긴 테이프
  const teeth = 5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  for (let k = 1; k <= teeth; k++) ctx.lineTo(w / 2 + (k % 2 ? 1 : -1) * h * 0.08 * (0.5 + r()), -h / 2 + (h * k) / teeth);
  ctx.lineTo(-w / 2, h / 2);
  for (let k = teeth - 1; k >= 0; k--) ctx.lineTo(-w / 2 + (k % 2 ? 1 : -1) * h * 0.08 * (0.5 + r()), -h / 2 + (h * k) / teeth);
  ctx.closePath();
}

function drawTape(ctx, x, y, w, h, rot, color, e, seed) {
  if (e <= 0) return;
  const r = rng(hashStr(seed));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.rect(-w / 2, -h, w * e, h * 2);
  ctx.clip();
  tapePath(ctx, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
  // 테이프 결 (가는 줄무늬)
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, h * 0.05);
  for (let k = -w; k < w; k += h * 0.5) {
    ctx.beginPath();
    ctx.moveTo(k, -h / 2);
    ctx.lineTo(k + h * 0.6, h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 손으로 그린 하트·별 낙서 (선이 그어지듯 나타남) */
function drawDoodle(ctx, kind, x, y, s, e, color, u) {
  if (e <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 4 * u);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const len = s * 9;
  ctx.setLineDash([len * e, len]);
  ctx.beginPath();
  if (kind === 'heart') {
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.45, -s * 0.85, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.2, 0, s * 0.35);
  } else if (kind === 'star') {
    for (let k = 0; k <= 10; k++) {
      const rr = k % 2 ? s * 0.22 : s * 0.55;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
  } else {
    // 반짝임 (짧은 선 세 개)
    for (const a of [-0.5, 0, 0.5]) {
      ctx.moveTo(Math.sin(a) * s * 0.25, -Math.cos(a) * s * 0.25);
      ctx.lineTo(Math.sin(a) * s * 0.6, -Math.cos(a) * s * 0.6);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function drawScrapbook(ctx, seg, tau, env) {
  const { W, H, u } = env;
  const n = seg.items.length;
  const p = clamp(tau / seg.dur);
  const z = lerp(1.0, 1.04, easeInOutSine(p));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.rotate(lerp(-0.004, 0.006, p));
  ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(kraftPaper(env), -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
  const r = rng(hashStr('scrap' + seg.key));
  const slots = looseSlots(n, W, H, 46 * u, r);
  const labels = cardLabels(seg.items, env.project.style);
  const full = n <= 3;
  const ink = 'rgba(62,38,20,0.88)';
  slots.forEach((sl, i) => {
    const it = seg.items[i];
    const ar = arOf(env, it, full, 0.75, 1.45);
    const hasText = !!labels[i];
    // 흰 테두리 인화지 크기 (글자가 있으면 아래 여백을 넓게)
    const fit = Math.min(sl.bw / (ar + 0.1), sl.bh / (1 + (hasText ? 0.24 : 0.1)));
    const ih = fit;
    const iw = fit * ar;
    const b = Math.max(6 * u, Math.min(iw, ih) * 0.05);
    const bottom = hasText ? ih * 0.17 + b : b;
    const cw = iw + b * 2;
    const chh = ih + b + bottom;
    const t0 = appearAt(seg, i, n, 0.62);
    const e = prog(tau, t0, t0 + 0.6);
    if (e <= 0) return;
    const land = easeOutCubic(e);
    const dir = i % 2 ? 1 : -1;
    ctx.save();
    ctx.translate(sl.x + (1 - land) * dir * 30 * u, sl.y - (1 - land) * 24 * u);
    ctx.rotate(sl.rot + (1 - land) * dir * 0.14);
    const sc = lerp(1.16, 1, land);
    ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, e * 3);
    ctx.shadowColor = `rgba(40,22,8,${0.28 + 0.12 * land})`;
    ctx.shadowBlur = lerp(40, 14, land) * u;
    ctx.shadowOffsetY = lerp(26, 6, land) * u;
    ctx.fillStyle = '#fbf8f0';
    ctx.fillRect(-cw / 2, -chh / 2, cw, chh);
    ctx.shadowColor = 'transparent';
    ctx.save();
    ctx.beginPath();
    ctx.rect(-cw / 2 + b, -chh / 2 + b, iw, ih);
    ctx.clip();
    photoOrBlank(ctx, env, it, full, -cw / 2 + b, -chh / 2 + b, iw, ih, lerp(1.08, 1.02, land));
    ctx.restore();
    // 손글씨 (왼쪽부터 써지듯)
    if (hasText) {
      const we = prog(tau, t0 + 0.55, t0 + 1.25);
      if (we > 0) {
        const fs = Math.min(bottom * 0.78, fitFontSize(ctx, HAND, labels[i], bottom * 0.78, iw * 0.94));
        setFont(ctx, HAND, fs);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.beginPath();
        ctx.rect(-cw / 2, chh / 2 - bottom, cw * we, bottom);
        ctx.clip();
        ctx.fillText(labels[i], 0, chh / 2 - bottom / 2 - b * 0.1);
        ctx.restore();
      }
    }
    // 마스킹 테이프: 위 가운데 한 줄 또는 양 모서리 두 줄
    const te = easeOutCubic(prog(tau, t0 + 0.4, t0 + 0.75));
    const tw = Math.max(cw * 0.34, 90 * u);
    const th = Math.max(16 * u, Math.min(cw, chh) * 0.075);
    const color = TAPES[(i + Math.floor(r() * 5)) % TAPES.length];
    if (r() < 0.6) drawTape(ctx, 0, -chh / 2, tw, th, (r() - 0.5) * 0.2, color, te, seg.key + i);
    else {
      drawTape(ctx, -cw / 2 + tw * 0.15, -chh / 2 + tw * 0.1, tw * 0.75, th, -0.75, color, te, seg.key + i + 'a');
      drawTape(ctx, cw / 2 - tw * 0.6, -chh / 2 - tw * 0.18, tw * 0.75, th, 0.75, color, te, seg.key + i + 'b');
    }
    ctx.restore();
    // 낙서: 카드 몇 장의 바깥 모서리에
    if (i % 3 === 1 || n === 2) {
      const kind = ['heart', 'star', 'spark'][(i + n) % 3];
      const de = prog(tau, t0 + 0.8, t0 + 1.5);
      const dx = sl.x + (dir > 0 ? cw / 2 + 26 * u : -cw / 2 - 26 * u);
      const dy = sl.y - chh / 2 + 10 * u;
      if (dx > 40 * u && dx < W - 40 * u && dy > 40 * u) drawDoodle(ctx, kind, dx, dy, 56 * u, de, i % 2 ? 'rgba(186,52,48,0.85)' : ink, u);
    }
  });
  ctx.restore();
}

// =====================================================================
// 카드 스택
// =====================================================================
export function drawStack(ctx, seg, tau, env) {
  const { W, H, u, theme } = env;
  const n = seg.items.length;
  const land = W >= H;
  const start = seg.tIn * 0.5;
  const end = seg.dur - seg.tOut * 0.6;
  const per = (end - start) / n;
  const FLY = Math.min(0.65, per * 0.6);
  // 지금까지 넘어간 장수 (연속 값: 1.4 = 두 번째 장이 반쯤 날아감)
  let c = 0;
  for (let k = 0; k < n - 1; k++) c += easeInOutCubic(prog(tau, start + per * (k + 1) - FLY * 0.5, start + per * (k + 1) + FLY * 0.5));
  const cur = Math.min(n - 1, Math.floor(c));
  // 배경: 맨 위 사진의 흐린 배경이 다음 사진으로 서서히 바뀜
  ctx.fillStyle = theme.dark ? '#050505' : theme.bg[1];
  ctx.fillRect(0, 0, W, H);
  for (const [k, al] of [[cur, 1], [cur + 1, c - cur]]) {
    const it = seg.items[k];
    if (!it || al <= 0.01) continue;
    const a = asset(env, it, true);
    if (!a?.bg) continue;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.imageSmoothingQuality = 'low';
    drawCover(ctx, a.bg, a.bg.width, a.bg.height, 0, 0, W, H, 1.15 + 0.04 * clamp(tau / seg.dur));
    ctx.restore();
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(20,14,8,0.3)';
  ctx.fillRect(0, 0, W, H);

  const cw = land ? Math.min(W * 0.6, H * 0.74 * 1.36) : W * 0.8;
  const chh = land ? cw / 1.36 : Math.min(H * 0.6, cw * 1.18);
  const b = Math.min(cw, chh) * 0.035;
  const r = rng(hashStr('stack' + seg.key));
  const rots = seg.items.map(() => (r() - 0.5) * 0.2);
  const offs = seg.items.map(() => [(r() - 0.5) * 36 * u, (r() - 0.5) * 24 * u]);
  const intro = easeOutCubic(prog(tau, seg.tIn * 0.3, seg.tIn * 0.3 + 0.8));
  ctx.save();
  ctx.translate(W / 2, H / 2 + (1 - intro) * H * 0.18);
  ctx.globalAlpha = Math.min(1, intro * 1.5);
  // 아래(뒤) 카드부터
  for (let j = Math.min(n - 1, cur + 4); j >= 0; j--) {
    const d = j - c;
    if (d <= -1) continue;
    ctx.save();
    if (d < 0) {
      // 날아가는 카드: 좌우 번갈아 호를 그리며 화면 밖으로
      const fe = -d;
      const dir = j % 2 ? 1 : -1;
      ctx.translate(dir * fe * W * 0.85, -fe * H * 0.12 + fe * fe * H * 0.3);
      ctx.rotate(rots[j] * 0.25 + dir * fe * 0.55);
      ctx.globalAlpha *= 1 - clamp((fe - 0.75) / 0.25);
    } else {
      const dd = Math.min(d, 3.5);
      const k = clamp(d);
      ctx.translate(offs[j][0] * k, offs[j][1] * k + dd * 10 * u);
      ctx.rotate(lerp(rots[j] * 0.25, rots[j], k));
      const s = 1 - 0.035 * dd;
      ctx.scale(s, s);
      if (d > 3) ctx.globalAlpha *= clamp(4 - d);
    }
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 12 * u;
    ctx.fillStyle = '#fbf9f4';
    ctx.fillRect(-cw / 2, -chh / 2, cw, chh);
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.rect(-cw / 2 + b, -chh / 2 + b, cw - 2 * b, chh - 2 * b);
    ctx.clip();
    // 맨 위에 있는 동안 천천히 다가오는 줌
    const own = clamp((tau - (start + per * j - FLY * 0.5)) / (per + FLY));
    photoOrBlank(ctx, env, seg.items[j], true, -cw / 2 + b, -chh / 2 + b, cw - 2 * b, chh - 2 * b, lerp(1.1, 1.02, d > 0.5 ? 0 : own));
    if (d > 0.05) {
      // 뒤 카드는 살짝 어둡게 (깊이감)
      ctx.fillStyle = `rgba(0,0,0,${0.18 * Math.min(1, d)})`;
      ctx.fillRect(-cw / 2, -chh / 2, cw, chh);
    }
    ctx.restore();
  }
  ctx.restore();
  // 몇 번째 사진인지 작은 점
  if (n > 2) {
    const dotA = intro * (1 - prog(tau, end, end + 0.4));
    ctx.save();
    ctx.globalAlpha = dotA * 0.9;
    const gap = 18 * u;
    const y = H / 2 + chh / 2 + 44 * u;
    for (let k = 0; k < n; k++) {
      ctx.beginPath();
      ctx.arc(W / 2 + (k - (n - 1) / 2) * gap, y, (k === Math.round(c) ? 5 : 3) * u, 0, Math.PI * 2);
      ctx.fillStyle = k === Math.round(c) ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.fill();
    }
    ctx.restore();
  }
}

// =====================================================================
// 갤러리 월 (전시장)
// =====================================================================
export function drawGalleryWall(ctx, seg, tau, env) {
  const { W, H, u, theme, typo } = env;
  const n = seg.items.length;
  const land = W >= H;
  const dark = theme.dark;
  const floorY = H * (land ? 0.84 : 0.8);
  // 벽
  const wg = ctx.createLinearGradient(0, 0, 0, floorY);
  wg.addColorStop(0, dark ? '#1d1b18' : '#d8d0c3');
  wg.addColorStop(1, dark ? '#2b2823' : '#e7e0d4');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, W, floorY);
  // 바닥 + 걸레받이
  const fg = ctx.createLinearGradient(0, floorY, 0, H);
  fg.addColorStop(0, dark ? '#15110d' : '#9c8262');
  fg.addColorStop(1, dark ? '#0a0806' : '#7d6448');
  ctx.fillStyle = fg;
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = dark ? '#0d0b09' : '#efe9de';
  ctx.fillRect(0, floorY - 10 * u, W, 10 * u);

  // 액자 배치 (가로 한 줄, 크기·높이를 조금씩 다르게 → 살롱식 전시)
  const base = land ? H * 0.42 : W * 0.62;
  const frames = [];
  let x = 0;
  const gap = land ? W * 0.07 : W * 0.12;
  const hang = land ? H * 0.42 : H * 0.42;
  for (let i = 0; i < n; i++) {
    const ar = arOf(env, seg.items[i], true, 0.7, 1.55);
    const hh = base * (i % 3 === 1 ? 0.78 : 1) * (ar > 1.2 ? 0.86 : 1);
    const ww = hh * ar;
    const mat = Math.min(ww, hh) * 0.13;
    const fb = Math.min(ww, hh) * 0.045 + 5 * u;
    const ow = ww + 2 * (mat + fb);
    const oh = hh + 2 * (mat + fb);
    frames.push({ x, cy: hang + (i % 2 ? 0.03 : -0.02) * H, ow, oh, ww, hh, mat, fb });
    x += ow + gap;
  }
  const total = x - gap;
  const pad = land ? W * 0.12 : W * 0.15;
  const p = clamp((tau - seg.tIn * 0.3) / Math.max(0.5, seg.dur - seg.tIn * 0.3 - seg.tOut * 0.3));
  let camX;
  if (total + pad * 2 > W) camX = lerp(-pad, total + pad - W, easeInOutSine(p));
  else camX = (total - W) / 2;
  const zoom = lerp(1.03, 1.0, easeOutCubic(p));
  const labels = cardLabels(seg.items, env.project.style);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
  frames.forEach((f, i) => {
    const sx = f.x - camX;
    if (sx > W * 1.1 || sx + f.ow < -W * 0.1) return;
    const cx = sx + f.ow / 2;
    const top = f.cy - f.oh / 2;
    // 조명: 액자가 화면 안쪽으로 들어올수록 켜짐 (패닝이 없으면 차례로)
    const lit = total + pad * 2 > W ? clamp((W * 0.95 - sx) / (W * 0.35)) : prog(tau, appearAt(seg, i, n), appearAt(seg, i, n) + 0.5);
    const L = easeOutCubic(lit);
    if (L > 0) {
      ctx.save();
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      // 천장에서 내려오는 빛기둥
      const beam = ctx.createLinearGradient(0, 0, 0, top + f.oh);
      beam.addColorStop(0, `rgba(255,236,200,${(dark ? 0.12 : 0.18) * L})`);
      beam.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(cx - f.ow * 0.12, 0);
      ctx.lineTo(cx + f.ow * 0.12, 0);
      ctx.lineTo(cx + f.ow * 0.85, top + f.oh * 1.1);
      ctx.lineTo(cx - f.ow * 0.85, top + f.oh * 1.1);
      ctx.closePath();
      ctx.fill();
      // 벽에 번진 빛
      const rr = Math.max(f.ow, f.oh) * 0.95;
      const gl = ctx.createRadialGradient(cx, top + f.oh * 0.25, 0, cx, top + f.oh * 0.25, rr);
      gl.addColorStop(0, `rgba(255,232,190,${(dark ? 0.26 : 0.35) * L})`);
      gl.addColorStop(1, 'rgba(255,232,190,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(cx - rr, top + f.oh * 0.25 - rr, rr * 2, rr * 2);
      ctx.restore();
    }
    // 액자 (그림자 → 틀 → 매트 → 사진)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 26 * u;
    ctx.shadowOffsetY = 16 * u;
    const fr = ctx.createLinearGradient(sx, top, sx + f.ow, top + f.oh);
    if (dark) {
      fr.addColorStop(0, '#2b2723');
      fr.addColorStop(1, '#0b0a09');
    } else {
      fr.addColorStop(0, '#a77d4f');
      fr.addColorStop(0.5, '#86603a');
      fr.addColorStop(1, '#5e4126');
    }
    ctx.fillStyle = fr;
    ctx.fillRect(sx, top, f.ow, f.oh);
    ctx.restore();
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(sx + f.fb, top + f.fb, f.ow - 2 * f.fb, f.oh - 2 * f.fb);
    const px = sx + f.fb + f.mat;
    const py = top + f.fb + f.mat;
    // 매트 안쪽 경사면
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(px - 3 * u, py - 3 * u, f.ww + 6 * u, f.hh + 6 * u);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, f.ww, f.hh);
    ctx.clip();
    photoOrBlank(ctx, env, seg.items[i], true, px, py, f.ww, f.hh, 1.0);
    ctx.restore();
    // 조명이 꺼진 동안 액자를 어둡게
    if (L < 1) {
      ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - L)})`;
      ctx.fillRect(sx, top, f.ow, f.oh);
    }
    // 작품 설명 명패
    const pw = Math.max(110 * u, f.ow * 0.26);
    const ph = 46 * u;
    const plx = sx + f.ow - pw;
    const ply = top + f.oh + 28 * u;
    if (ply + ph < floorY - 14 * u) {
      ctx.fillStyle = dark ? 'rgba(240,234,222,0.86)' : '#fbf9f4';
      ctx.fillRect(plx, ply, pw, ph);
      ctx.fillStyle = 'rgba(30,26,22,0.8)';
      if (labels[i]) {
        const fs = fitFontSize(ctx, typo.body, labels[i], 18 * u, pw - 16 * u);
        setFont(ctx, typo.body, fs, 600);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], plx + 8 * u, ply + ph * 0.38);
        ctx.fillStyle = 'rgba(30,26,22,0.35)';
        ctx.fillRect(plx + 8 * u, ply + ph * 0.7, pw * 0.45, 3 * u);
      } else {
        ctx.fillStyle = 'rgba(30,26,22,0.45)';
        ctx.fillRect(plx + 8 * u, ply + ph * 0.3, pw * 0.6, 4 * u);
        ctx.fillStyle = 'rgba(30,26,22,0.25)';
        ctx.fillRect(plx + 8 * u, ply + ph * 0.6, pw * 0.4, 3 * u);
      }
    }
  });
  ctx.restore();
  // 전체 조명 비네트
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${dark ? 0.55 : 0.28})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// =====================================================================
// 사선 분할
// =====================================================================
export function drawDiagonal(ctx, seg, tau, env) {
  const { W, H, u, theme } = env;
  const n = seg.items.length;
  const land = W >= H;
  // 가로 화면 기준으로 계산한 좌표를 세로 화면이면 90도 돌려 씀 (사진은 항상 바로 선 채로)
  const LW = land ? W : H;
  const LH = land ? H : W;
  const map = (x, y) => (land ? [x, y] : [LH - y, x]);
  ctx.fillStyle = theme.dark ? '#050505' : theme.bg[1];
  ctx.fillRect(0, 0, W, H);
  const s = LH * 0.2;
  const bnd = [];
  for (let k = 0; k <= n; k++) bnd.push(k === 0 ? -s * 2 : k === n ? LW + s * 2 : (k * LW) / n);
  const p = clamp(tau / seg.dur);
  const vlen = Math.hypot(2 * s, LH);
  const vx = (2 * s) / vlen;
  const vy = -LH / vlen;
  const es = [];
  for (let i = 0; i < n; i++) {
    const t0 = appearAt(seg, i, n, 0.42);
    es.push(prog(tau, t0, t0 + 0.75));
  }
  const zoom = lerp(1.0, 1.035, easeInOutSine(p));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-W / 2, -H / 2);
  for (let i = 0; i < n; i++) {
    const e = easeOutQuart(es[i]);
    if (e <= 0) continue;
    const dir = i % 2 ? 1 : -1;
    const off = (1 - e) * vlen * 1.05 * dir;
    const pts = [
      [bnd[i] + s, 0],
      [bnd[i + 1] + s, 0],
      [bnd[i + 1] - s, LH],
      [bnd[i] - s, LH],
    ].map(([x, y]) => map(x + vx * off, y + vy * off));
    ctx.save();
    ctx.beginPath();
    pts.forEach(([x, y], k) => ctx[k ? 'lineTo' : 'moveTo'](x, y));
    ctx.closePath();
    ctx.clip();
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const bx = Math.min(...xs);
    const by = Math.min(...ys);
    const bw = Math.max(...xs) - bx;
    const bh = Math.max(...ys) - by;
    // 조각 안에서 서로 반대 방향으로 흐르는 패럴랙스
    const drift = dir * (p - 0.5) * 0.3;
    photoOrBlank(ctx, env, seg.items[i], true, bx, by, bw, bh, 1.08, 0.5 + (land ? drift : 0), 0.45 + (land ? 0 : drift));
    ctx.restore();
  }
  // 경계선 + 자리 잡는 순간 경계를 스치는 빛
  ctx.lineCap = 'butt';
  for (let k = 1; k < n; k++) {
    const al = Math.min(es[k - 1], es[k]);
    if (al <= 0) continue;
    const [x0, y0] = map(bnd[k] + s, 0);
    const [x1, y1] = map(bnd[k] - s, LH);
    ctx.strokeStyle = theme.dark ? `rgba(5,5,5,${al})` : `rgba(250,247,240,${al})`;
    ctx.lineWidth = 10 * u;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const t0 = appearAt(seg, k, n, 0.42);
    const gl = prog(tau, t0 + 0.45, t0 + 1.0);
    if (gl > 0 && gl < 1) {
      const gy = lerp(-0.2, 1.2, gl);
      const [gx0, gy0] = map(lerp(bnd[k] + s, bnd[k] - s, gy - 0.15), LH * (gy - 0.15));
      const [gx1, gy1] = map(lerp(bnd[k] + s, bnd[k] - s, gy + 0.15), LH * (gy + 0.15));
      const lg = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      lg.addColorStop(0, 'rgba(255,248,230,0)');
      lg.addColorStop(0.5, `rgba(255,248,230,${0.9 * Math.sin(gl * Math.PI)})`);
      lg.addColorStop(1, 'rgba(255,248,230,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = lg;
      ctx.lineWidth = 6 * u;
      ctx.beginPath();
      ctx.moveTo(gx0, gy0);
      ctx.lineTo(gx1, gy1);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

// =====================================================================
// 벤토 콜라주
// =====================================================================
const BENTO = {
  2: [[0, 0, 0.62, 1], [0.62, 0, 0.38, 1]],
  3: [[0, 0, 0.58, 1], [0.58, 0, 0.42, 0.55], [0.58, 0.55, 0.42, 0.45]],
  4: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.24, 0.5], [0.74, 0.5, 0.26, 0.5]],
  5: [[0, 0, 0.42, 0.62], [0, 0.62, 0.42, 0.38], [0.42, 0, 0.33, 1], [0.75, 0, 0.25, 0.45], [0.75, 0.45, 0.25, 0.55]],
  6: [[0, 0, 0.4, 0.62], [0.4, 0, 0.32, 0.38], [0.72, 0, 0.28, 0.62], [0.4, 0.38, 0.32, 0.62], [0, 0.62, 0.4, 0.38], [0.72, 0.62, 0.28, 0.38]],
  7: [[0, 0, 0.38, 0.6], [0.38, 0, 0.24, 0.42], [0.62, 0, 0.38, 0.42], [0.38, 0.42, 0.34, 0.58], [0.72, 0.42, 0.28, 0.58], [0, 0.6, 0.19, 0.4], [0.19, 0.6, 0.19, 0.4]],
  8: [[0, 0, 0.34, 0.58], [0.34, 0, 0.22, 0.4], [0.56, 0, 0.22, 0.4], [0.78, 0, 0.22, 0.58], [0.34, 0.4, 0.44, 0.6], [0, 0.58, 0.17, 0.42], [0.17, 0.58, 0.17, 0.42], [0.78, 0.58, 0.22, 0.42]],
};

export function drawBento(ctx, seg, tau, env) {
  const { W, H, u, theme, typo } = env;
  const n = seg.items.length;
  ctx.fillStyle = theme.dark ? '#0b0b0c' : theme.bg[1];
  ctx.fillRect(0, 0, W, H);
  const land = W >= H;
  const m = 28 * u;
  const gap = 14 * u;
  const cells = (BENTO[Math.min(8, Math.max(2, n))] || BENTO[4]).map(([x, y, w, h]) => (land ? [x, y, w, h] : [y, x, h, w])).map(([x, y, w, h]) => ({
    x: m + x * (W - 2 * m) + gap / 2,
    y: m + y * (H - 2 * m) + gap / 2,
    w: w * (W - 2 * m) - gap,
    h: h * (H - 2 * m) - gap,
  }));
  // 가장 큰 칸에 첫 사진(주인공), 나머지는 차례대로
  const heroIdx = cells.reduce((b, c, k) => (c.w * c.h > cells[b].w * cells[b].h ? k : b), 0);
  const order = [heroIdx, ...cells.map((_, k) => k).filter((k) => k !== heroIdx)];
  const hero = cells[heroIdx];
  // 카메라: 주인공 칸이 화면을 꽉 채운 상태에서 전체가 보이도록 빠짐
  const vw0 = Math.min(hero.w, (hero.h * W) / H);
  const vh0 = (vw0 * H) / W;
  const hv = { x: hero.x + hero.w / 2 - vw0 / 2, y: hero.y + hero.h / 2 - vh0 / 2, w: vw0, h: vh0 };
  const t0 = seg.tIn * 0.5 + 0.55;
  const pull = easeInOutCubic(prog(tau, t0, t0 + 1.5));
  const after = clamp((tau - t0 - 1.5) / Math.max(1, seg.dur - t0 - 1.5));
  const shrink = 0.025 * easeInOutSine(after);
  const view = {
    x: lerp(hv.x, 0, pull) + W * shrink * 0.5,
    y: lerp(hv.y, 0, pull) + H * shrink * 0.5,
    w: lerp(hv.w, W, pull) * (1 - shrink),
    h: lerp(hv.h, H, pull) * (1 - shrink),
  };
  const sx = W / view.w;
  const sy = H / view.h;
  // 칸마다의 줌·초점 흔들림은 미리 정해 둠 (화면 밖 칸을 건너뛰어도 다른 칸 값이 바뀌지 않게)
  const r = rng(hashStr('bento' + seg.key));
  const jit = order.map(() => [r() * 0.02, (r() - 0.5) * 0.2]);
  order.forEach((ci, i) => {
    const c = cells[ci];
    const e = i === 0 ? 1 : easeOutCubic(clamp((pull - 0.15 - (0.5 * (i - 1)) / Math.max(1, n - 1)) / 0.4));
    if (e <= 0) return;
    const s = lerp(0.82, 1, e);
    const cx = (c.x + c.w / 2 - view.x) * sx;
    const cy = (c.y + c.h / 2 - view.y) * sy;
    const w = c.w * sx * s;
    const h = c.h * sy * s;
    if (cx + w / 2 < 0 || cx - w / 2 > W || cy + h / 2 < 0 || cy - h / 2 > H) return;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 16 * u * sx * lerp(0.4, 1, pull));
    ctx.clip();
    const kz = lerp(1.1, 1.02, clamp(tau / seg.dur)) + jit[i][0];
    photoOrBlank(ctx, env, seg.items[i], true, cx - w / 2, cy - h / 2, w, h, kz, 0.5 + jit[i][1], 0.42);
    ctx.restore();
  });
  // 주인공 칸 위 글자 칩 (연도·폴더 등)
  const t = photoText(seg.items[0], env.project.style);
  const chip = t.big || t.folder;
  const ca = prog(tau, t0 + 1.2, t0 + 1.8) * (1 - prog(tau, seg.dur - seg.tOut * 0.6 - 0.4, seg.dur - seg.tOut * 0.6));
  if (chip && ca > 0) {
    const hx = (hero.x - view.x) * sx;
    const hy = (hero.y + hero.h - view.y) * sy;
    const fs = fitFontSize(ctx, typo.eyebrow, chip, 30 * u, hero.w * sx * 0.7, 0.04);
    setFont(ctx, typo.eyebrow, fs, Math.max(600, typo.eyebrow.weight));
    const tw = ctx.measureText(chip).width + fs * 0.04 * chip.length;
    const ph = fs * 1.9;
    ctx.save();
    ctx.globalAlpha = ca;
    ctx.fillStyle = 'rgba(10,10,10,0.55)';
    ctx.beginPath();
    ctx.roundRect(hx + 22 * u, hy - 22 * u - ph, tw + fs * 1.6, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = '#fbf7ee';
    ctx.textBaseline = 'middle';
    drawTracked(ctx, chip, hx + 22 * u + fs * 0.8, hy - 22 * u - ph / 2, fs * 0.04, 'left');
    ctx.restore();
  }
}

// =====================================================================
// 연표 타임라인
// =====================================================================
/** 카드 아래 연표 글자: 여러 해에 걸쳐 있으면 연도, 한 해 안이면 월·일, 없으면 폴더 이름 */
function timelineLabels(items, style) {
  const ts = items.map((it) => photoText(it, style));
  const years = new Set(ts.map((t) => t.year).filter(Boolean));
  return ts.map((t) => {
    if (t.label) return { big: t.label, small: t.folder && t.folder !== t.label ? t.folder : '' };
    if (years.size > 1 && t.year) return { big: String(t.year), small: t.folder };
    if (t.date) return { big: t.date.slice(6).replace(' ', ''), small: years.size === 1 && t.year ? String(t.year) : t.folder };
    if (t.year) return { big: String(t.year), small: t.folder };
    return { big: t.folder || '', small: '' };
  });
}

export function drawTimeline(ctx, seg, tau, env) {
  const { W, H, u, theme, typo } = env;
  const n = seg.items.length;
  const land = W >= H;
  drawThemeBackground(ctx, W, H, theme, tau, 0.5);
  drawBokeh(ctx, W, H, tau, { seed: 'tl' + seg.key, discs: 5, sparks: 14, color: theme.particle, alpha: theme.dark ? 0.35 : 0.25 });
  const AL = land ? W : H; // 진행 방향 길이
  const AC = land ? H : W; // 가로지르는 방향 길이
  const pos = (a, c) => (land ? [a, c] : [c, a]);
  const cardW = land ? H * (n <= 3 ? 0.56 : 0.46) : W * 0.42;
  const cardH = land ? cardW / 1.3 : cardW * 0.8;
  const cardA = land ? cardW : cardH; // 진행 방향 크기
  const cardC = land ? cardH : cardW; // 가로지르는 방향 크기
  const spacing = cardA * 0.74;
  const lineC = AC / 2;
  const first = AL * 0.18;
  const dots = seg.items.map((_, i) => first + i * spacing);
  const span = dots[n - 1] - dots[0];
  // 선 끝이 지나가는 위치 (선이 다 그어지면 잠시 멈춤)
  const t0 = seg.tIn * 0.4;
  const t1 = Math.max(t0 + 1, seg.dur - seg.tOut - 0.6);
  const tip = lerp(dots[0] - spacing * 0.5, dots[n - 1] + spacing * 0.35, easeInOutSine(prog(tau, t0, t1)));
  const fits = span + cardA * 1.4 < AL;
  const cam = fits ? (dots[0] + dots[n - 1]) / 2 - AL / 2 : clamp(tip - AL * 0.62, dots[0] - AL * 0.25, dots[n - 1] + AL * 0.25 - AL * 0.95);
  const labels = timelineLabels(seg.items, env.project.style);
  const accent = theme.accentSolid;
  // 배경 큰 연도 (지금 지나는 점의 글자)
  const curIdx = Math.max(0, Math.min(n - 1, Math.floor((tip - dots[0]) / spacing + 0.5)));
  const wm = labels[curIdx]?.big;
  if (wm && /\d/.test(wm)) {
    setFont(ctx, typo.display, AC * 0.5, typo.display.weight);
    ctx.save();
    ctx.globalAlpha = theme.dark ? 0.06 : 0.08;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wm, W / 2, H / 2);
    ctx.restore();
  }
  // 선
  const lw = 4 * u;
  const [la0x, la0y] = pos(dots[0] - spacing * 0.5 - cam, lineC);
  const [la1x, la1y] = pos(tip - cam, lineC);
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(la0x, la0y);
  ctx.lineTo(la1x, la1y);
  ctx.stroke();
  // 앞으로 이어질 점선
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([10 * u, 12 * u]);
  const [lfx, lfy] = pos(dots[n - 1] + spacing * 0.5 - cam, lineC);
  ctx.beginPath();
  ctx.moveTo(la1x, la1y);
  ctx.lineTo(lfx, lfy);
  ctx.stroke();
  ctx.restore();
  // 선 끝의 빛나는 점
  ctx.save();
  ctx.globalCompositeOperation = theme.dark ? 'lighter' : 'source-over';
  const gr = ctx.createRadialGradient(la1x, la1y, 0, la1x, la1y, 26 * u);
  gr.addColorStop(0, theme.dark ? 'rgba(255,240,200,0.9)' : 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(la1x - 26 * u, la1y - 26 * u, 52 * u, 52 * u);
  ctx.restore();

  for (let i = 0; i < n; i++) {
    const a = dots[i] - cam;
    if (a < -cardA || a > AL + cardA) continue;
    const reach = clamp((tip - dots[i]) / (spacing * 0.55));
    if (reach <= 0) continue;
    const e = easeOutCubic(reach);
    const side = i % 2 ? 1 : -1; // -1: 위(왼쪽), 1: 아래(오른쪽)
    const [dx, dy] = pos(a, lineC);
    // 점 + 퍼지는 고리
    ctx.save();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(dx, dy, 9 * u * backOut(Math.min(1, reach * 1.6)), 0, Math.PI * 2);
    ctx.fill();
    if (reach < 1) {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 1 - reach;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.arc(dx, dy, (10 + 40 * reach) * u, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // 카드: 선에서 솟아오름
    const gapC = AC * 0.06;
    const cc = lineC + side * (gapC + cardC / 2) * e;
    const [cx, cy] = pos(a, cc);
    // 연결선
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.7 * e;
    ctx.lineWidth = 2 * u;
    const [sx1, sy1] = pos(a, lineC + side * gapC * e);
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(sx1, sy1);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const sc = lerp(0.55, 1, e);
    ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, reach * 2);
    const b = 8 * u;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 24 * u;
    ctx.shadowOffsetY = 10 * u;
    ctx.fillStyle = '#fbf9f4';
    ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.rect(-cardW / 2 + b, -cardH / 2 + b, cardW - 2 * b, cardH - 2 * b);
    ctx.clip();
    photoOrBlank(ctx, env, seg.items[i], false, -cardW / 2 + b, -cardH / 2 + b, cardW - 2 * b, cardH - 2 * b, lerp(1.12, 1.02, e));
    ctx.restore();
    // 연도(큰 글자) + 폴더(작은 글자): 선 반대편
    const lb = labels[i];
    if (lb.big) {
      const te = easeOutCubic(prog(reach, 0.35, 1));
      if (te > 0) {
        ctx.save();
        ctx.globalAlpha = te;
        const maxW = land ? spacing * 0.95 : W / 2 - 60 * u;
        const fs = fitFontSize(ctx, typo.display, lb.big, 66 * u, maxW, 0.02);
        setFont(ctx, typo.display, fs, Math.max(500, typo.display.weight));
        const off = (gapC * 0.6 + fs * 0.75) * -side;
        const [tx, ty] = pos(a, lineC + off + (land ? (side < 0 ? fs * 0.35 : -fs * 0.05) : 0));
        const align = land ? 'center' : side < 0 ? 'left' : 'right';
        const ox = land ? 0 : side < 0 ? 26 * u : -26 * u;
        ctx.fillStyle = theme.dark ? accentGradient(ctx, { ...theme, accent: env.darkAccent }, ty - fs * 0.75, ty + fs * 0.1) : theme.text;
        ctx.textBaseline = 'alphabetic';
        drawTracked(ctx, lb.big, tx + ox, ty + (1 - te) * 12 * u * -side, fs * 0.02, align);
        if (lb.small) {
          const fs2 = fitFontSize(ctx, typo.body, lb.small, 24 * u, maxW, 0.02);
          setFont(ctx, typo.body, fs2, Math.max(500, typo.body.weight));
          ctx.fillStyle = theme.textDim;
          const sy2 = land ? (side < 0 ? ty + fs2 * 1.5 : ty - fs * 1.05) : ty + fs2 * 1.5;
          drawTracked(ctx, lb.small, tx + ox, sy2, fs2 * 0.02, align);
        }
        ctx.restore();
      }
    }
  }
}
