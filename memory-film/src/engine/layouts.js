// 사진 장면 레이아웃 (연출 스타일이 섞어 쓰는 '한 장 사진' 화면 구성)
//   framed    액자      — 흐린 같은 사진 배경 위 매트 액자
//   editorial 매거진    — 한쪽은 사진, 한쪽은 큰 연도·제목 타이포 (잡지 화보)
//   reveal    흑백→컬러 — 흑백으로 시작해 사선으로 색이 번짐
//   punch     임팩트 줌 — 확 다가와 꽂히며 번쩍, 짧게 흔들림
//   cinema    시네마    — 영화 화면비 레터박스 + 로어서드 자막
//   circle    원형 포커스 — 동그란 창 속 사진 + 빛나는 링
// (ctx, seg, tau, env, asset) 에 대한 순수 함수 (결정적)
import { drawCover, setFont, drawTracked, fitFontSize, accentGradient, drawBokeh, drawCharsReveal, visibleChars } from './draw.js';
import { prog, clamp, lerp, easeOutCubic, easeInOutSine, easeOutQuart, easeOutExpo, inOut, hashStr } from './math.js';
import { photoText } from './timeline.js';

/** 사각형 안에서의 켄번스 (장면의 움직임 종류·초점을 따름) */
export function kenBurnsIn(ctx, a, seg, tau, x, y, w, h, strength = 1) {
  const p = clamp(tau / seg.dur);
  const e = lerp(p, easeInOutSine(p), 0.4);
  const m = seg.motion || { type: 'zoomIn', amount: 1, fx: 0, fy: 0 };
  const amt = m.amount * strength;
  const Z = 0.1 * amt;
  const foc = seg.item?.focus;
  const fx = foc ? foc.x : 0.5 + m.fx * 0.12;
  const fy = foc ? foc.y : 0.42 + m.fy * 0.08;
  let z = 1.02 + Z * e;
  let px = fx;
  let py = fy;
  const pr = 0.22 * amt;
  if (m.type === 'zoomOut') z = 1.02 + Z * (1 - e);
  else if (m.type === 'panLeft') {
    z = 1.06 + Z * 0.5;
    px = clamp(fx + lerp(pr, -pr, e));
  } else if (m.type === 'panRight') {
    z = 1.06 + Z * 0.5;
    px = clamp(fx + lerp(-pr, pr, e));
  } else if (m.type === 'panUp') {
    z = 1.06 + Z * 0.5;
    py = clamp(fy + lerp(pr, -pr, e));
  } else if (m.type === 'panDown') {
    z = 1.06 + Z * 0.5;
    py = clamp(fy + lerp(-pr, pr, e));
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  drawCover(ctx, a.img, a.w, a.h, x, y, w, h, z, px, py);
  ctx.restore();
}

/** 흐린 배경 (사진의 흐린 버전 + 어둡게) */
function blurredBg(ctx, env, a, tau, seg, dark = 0.45) {
  const { W, H, theme } = env;
  ctx.imageSmoothingQuality = 'low';
  if (a.bg) drawCover(ctx, a.bg, a.bg.width, a.bg.height, 0, 0, W, H, 1.1 + 0.05 * clamp(tau / seg.dur));
  else {
    ctx.fillStyle = theme.bg[0];
    ctx.fillRect(0, 0, W, H);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = theme.dark ? theme.scrim + `${dark})` : `rgba(18,12,6,${dark * 0.7})`;
  ctx.fillRect(0, 0, W, H);
}

/** 큰 사각형 그림자: 크기별로 한 번만 흐리게 만들어 캐시 (매 프레임 그림자 블러 제거) */
function softShadow(ctx, env, x, y, w, h, alpha = 0.6, round = false) {
  const { u } = env;
  const B = 90 * u;
  const q = 4;
  const key = `lshadow|${Math.round(w / 8)}x${Math.round(h / 8)}|${round}|${Math.round(u * 100)}`;
  let sh = env.cache.get(key);
  if (!sh) {
    const c = new OffscreenCanvas(Math.ceil((w + B * 2) / q), Math.ceil((h + B * 2) / q));
    const g = c.getContext('2d');
    g.filter = `blur(${((32 * u) / q).toFixed(2)}px)`;
    g.fillStyle = '#000';
    if (round) {
      g.beginPath();
      g.ellipse((B + w / 2) / q, (B + h / 2) / q, w / 2 / q, h / 2 / q, 0, 0, Math.PI * 2);
      g.fill();
    } else g.fillRect(B / q, B / q, w / q, h / q);
    sh = c.transferToImageBitmap();
    env.cache.set(key, sh);
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(sh, x - B, y - B + 18 * u, w + B * 2, h + B * 2);
  ctx.restore();
}

// ---------------------------------------------------------------- 액자
export function drawFramed(ctx, seg, tau, env, a) {
  const { W, H, u } = env;
  blurredBg(ctx, env, a, tau, seg, 0.5);
  const ar = a.w / a.h;
  const land = W >= H;
  const maxW = W * (land ? 0.7 : 0.8);
  const maxH = H * (land ? 0.74 : 0.6);
  const mat = Math.min(W, H) * 0.045;
  const fb = 9 * u;
  let iw = maxW - 2 * (mat + fb);
  let ih = iw / ar;
  if (ih > maxH - 2 * (mat + fb)) {
    ih = maxH - 2 * (mat + fb);
    iw = ih * ar;
  }
  const ow = iw + 2 * (mat + fb);
  const oh = ih + 2 * (mat + fb);
  const e = easeOutCubic(prog(tau, 0, Math.max(0.6, seg.tIn + 0.4)));
  const p = clamp(tau / seg.dur);
  const s = lerp(0.94, 1, e) * lerp(1, 1.025, easeInOutSine(p));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-ow / 2, -oh / 2);
  softShadow(ctx, env, 0, 0, ow, oh, 0.7);
  const fr = ctx.createLinearGradient(0, 0, ow, oh);
  fr.addColorStop(0, '#2c2620');
  fr.addColorStop(1, '#0e0c0a');
  ctx.fillStyle = fr;
  ctx.fillRect(0, 0, ow, oh);
  ctx.fillStyle = '#f6f3ec';
  ctx.fillRect(fb, fb, ow - 2 * fb, oh - 2 * fb);
  // 매트 안쪽 경사면
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(fb + mat - 3 * u, fb + mat - 3 * u, iw + 6 * u, ih + 6 * u);
  kenBurnsIn(ctx, a, seg, tau, fb + mat, fb + mat, iw, ih, 0.6);
  ctx.restore();
}

// ---------------------------------------------------------------- 원형 포커스
export function drawCircle(ctx, seg, tau, env, a) {
  const { W, H, u, theme } = env;
  blurredBg(ctx, env, a, tau, seg, 0.62);
  drawBokeh(ctx, W, H, tau, { seed: 'cir' + seg.key, discs: 6, sparks: 18, color: theme.particle, alpha: 0.45 });
  const R0 = Math.min(W, H) * 0.37;
  const e = prog(tau, seg.tIn * 0.2, seg.tIn * 0.2 + 0.9);
  const grow = e <= 0 ? 0 : 1 + 2.2 * Math.pow(e - 1, 3) + 1.2 * Math.pow(e - 1, 2);
  const R = R0 * lerp(0.6, 1, grow) * lerp(1, 1.03, easeInOutSine(clamp(tau / seg.dur)));
  const cx = W / 2;
  const cy = H / 2 - (W >= H ? 0 : H * 0.04);
  if (R > 1) {
    // 그림자는 최종 크기(R0)로 한 번만 만들고 확대/축소해 씀 (커지는 동안 캐시가 쌓이지 않게)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(R / R0, R / R0);
    softShadow(ctx, env, -R0, -R0, R0 * 2, R0 * 2, 0.75, true);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    kenBurnsIn(ctx, a, seg, tau, cx - R, cy - R, R * 2, R * 2, 0.8);
    ctx.restore();
  }
  // 링: 그어지듯 한 바퀴 + 바깥 점선 링이 천천히 회전
  const re = easeOutCubic(prog(tau, seg.tIn * 0.4, seg.tIn * 0.4 + 1.1));
  if (re > 0) {
    ctx.save();
    ctx.strokeStyle = theme.accentSolid;
    ctx.lineWidth = 4 * u;
    ctx.shadowColor = theme.particle;
    ctx.shadowBlur = 18 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 12 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * re);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 0.55 * re;
    ctx.lineWidth = 2 * u;
    ctx.setLineDash([3 * u, 14 * u]);
    ctx.lineDashOffset = -tau * 30 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 34 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 흑백→컬러
/** 이미 그려진 장면 위에 '채도 0' 혼합으로 흑백 영역을 만들고, 사선 경계가 지나가며 색이 돌아옴 */
export function applyReveal(ctx, seg, tau, env) {
  const { W, H, u } = env;
  const usable = seg.dur - seg.tOut;
  const w0 = Math.max(seg.tIn * 0.8, usable * 0.22);
  const w1 = Math.max(w0 + 0.8, usable * 0.6);
  const k = easeInOutSine(prog(tau, w0, w1));
  if (k >= 1) return;
  // 경계: 왼쪽 아래 → 오른쪽 위로 진행하는 사선 (폭 band 만큼 부드럽게)
  const band = Math.max(W, H) * 0.18;
  const nx = 1 / Math.SQRT2;
  const ny = -1 / Math.SQRT2;
  // 기준점 (0,H)에서 (nx,ny) 방향으로 pos 만큼 간 지점이 경계 → 그 앞쪽(아직 흑백)만 회색 혼합
  const pos = lerp(-band * 0.25, (W + H) / Math.SQRT2 + band, k);
  const ox = nx * pos;
  const oy = H + ny * pos;
  const g = ctx.createLinearGradient(ox - nx * band, oy - ny * band, ox + nx * band * 0.2, oy + ny * band * 0.2);
  g.addColorStop(0, 'rgba(128,128,128,0)');
  g.addColorStop(1, 'rgba(128,128,128,1)');
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 흑백 쪽은 대비를 조금 높여 옛 사진 느낌
  ctx.globalCompositeOperation = 'source-over';
  if (k > 0 && k < 1) {
    // 경계의 빛 줄기
    const lg = ctx.createLinearGradient(ox - nx * 30 * u, oy - ny * 30 * u, ox + nx * 30 * u, oy + ny * 30 * u);
    lg.addColorStop(0, 'rgba(255,240,210,0)');
    lg.addColorStop(0.5, `rgba(255,240,210,${0.22 * Math.sin(k * Math.PI)})`);
    lg.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 임팩트 줌
/** base()로 그린 장면을 레이어에 받아 '확 다가와 꽂히는' 줌 + 잔상(모션 블러) + 섬광 + 흔들림 */
export function drawPunch(ctx, seg, tau, env, base) {
  const { W, H, u } = env;
  const L = seg.tIn < 0.05 ? 0.4 : Math.max(0.28, Math.min(0.55, seg.tIn * 0.75));
  const k = prog(tau, 0, L);
  if (k >= 1 && tau > L + 0.4) {
    base();
    return;
  }
  const g = env.layerCtx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  base(g);
  const zoomAt = (q) => lerp(1.38, 1, q * q); // 가속하며 꽂힘
  const z = zoomAt(k);
  const speed = (zoomAt(Math.max(0, k - 0.12)) - z) * 4;
  // 흔들림: 꽂힌 직후 0.35초 동안 줄어드는 떨림
  const sh = prog(tau, L, L + 0.38);
  const amp = sh > 0 && sh < 1 ? (1 - sh) * 14 * u : 0;
  const ox = amp * Math.sin(tau * 83 + hashStr(seg.key) % 7);
  const oy = amp * Math.cos(tau * 71);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const put = (s, al) => {
    ctx.globalAlpha = al;
    ctx.drawImage(env.layer, 0, 0, W, H, W / 2 - (W * s) / 2 + ox, H / 2 - (H * s) / 2 + oy, W * s, H * s);
  };
  put(z, 1);
  if (speed > 0.01) for (let i = 1; i <= 3; i++) put(z * (1 + speed * 0.06 * i), 0.22 / i);
  ctx.globalAlpha = 1;
  // 섬광
  const fl = 1 - prog(tau, L, L + 0.3);
  if (k >= 1 && fl > 0) {
    ctx.fillStyle = `rgba(255,252,245,${(0.55 * fl * fl).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 시네마 (레터박스 + 로어서드)
export function drawCinema(ctx, seg, tau, env, a) {
  const { W, H, u, typo } = env;
  const land = W >= H;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const bandH = land ? W / 2.39 : H * 0.6;
  const open = easeOutQuart(prog(tau, 0, Math.max(0.7, seg.tIn + 0.3)));
  const bh = lerp(H * 0.86, bandH, open);
  const y0 = (H - bh) / 2;
  kenBurnsIn(ctx, a, seg, tau, 0, y0, W, bh, 1);
  const t = photoText(seg.item);
  const title = t.label || t.caption;
  const sub = t.label ? t.caption : '';
  const eyebrow = t.folder && t.folder !== title ? t.folder : '';
  const right = t.date || (t.year ? String(t.year) : '');
  if (!title && !eyebrow && !right) return true;
  const inS = seg.tIn * 0.6 + 0.2;
  const outE = seg.dur - seg.tOut * 0.55;
  const al = inOut(tau, inS, inS + 0.8, Math.max(inS + 1, outE - 0.6), outE);
  if (al <= 0.001) return true;
  // 로어서드: 레터박스 아래 띠 + 사진 아래쪽에 걸침
  const x = W * (land ? 0.07 : 0.08);
  const baseY = y0 + bh - (land ? 40 : 60) * u;
  ctx.save();
  const sg = ctx.createLinearGradient(0, y0 + bh * 0.55, 0, y0 + bh);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(1, `rgba(0,0,0,${0.55 * al})`);
  ctx.fillStyle = sg;
  ctx.fillRect(0, y0 + bh * 0.55, W, bh * 0.45);
  const slide = (1 - easeOutCubic(prog(tau, inS, inS + 0.9))) * -30 * u;
  ctx.globalAlpha = al;
  // 강조 막대
  const barH = (title ? 92 : 40) * u * (sub ? 1.25 : 1);
  ctx.fillStyle = env.darkAccentSolid;
  ctx.fillRect(x + slide - 22 * u, baseY - barH, 5 * u, barH);
  ctx.textBaseline = 'alphabetic';
  let yy = baseY;
  if (sub) {
    const fs = fitFontSize(ctx, typo.body, sub, 30 * u, W * 0.6);
    setFont(ctx, typo.body, fs, Math.max(400, typo.body.weight));
    ctx.fillStyle = 'rgba(250,246,238,0.85)';
    drawTracked(ctx, sub, x + slide, yy, fs * 0.01, 'left');
    yy -= fs * 1.5;
  }
  if (title) {
    const fs = fitFontSize(ctx, typo.title, title, 52 * u, W * 0.62);
    setFont(ctx, typo.title, fs, Math.max(500, typo.title.weight));
    ctx.fillStyle = '#fbf7ee';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12 * u;
    const stag = Math.min(0.03, 0.7 / Math.max(1, visibleChars(title)));
    ctx.globalAlpha = 1; // drawCharsReveal 이 alpha 를 직접 곱함 (두 번 곱해지지 않게)
    drawCharsReveal(ctx, title, x + slide, yy, { t: tau, start: inS + 0.15, stagger: stag, dur: 0.5, rise: 8 * u, tracking: fs * 0.01, align: 'left', alpha: al });
    ctx.globalAlpha = al;
    ctx.shadowColor = 'transparent';
    yy -= fs * 1.25;
  }
  if (eyebrow) {
    const fs = fitFontSize(ctx, typo.eyebrow, eyebrow, 22 * u, W * 0.5, 0.18);
    setFont(ctx, typo.eyebrow, fs, Math.max(600, typo.eyebrow.weight));
    ctx.fillStyle = env.darkAccentSolid;
    drawTracked(ctx, eyebrow.toUpperCase(), x + slide, yy, fs * 0.18, 'left');
  }
  // 오른쪽 아래: 날짜 (아래 검은 띠 안)
  if (right) {
    const fs = 22 * u;
    setFont(ctx, typo.eyebrow, fs, Math.max(500, typo.eyebrow.weight));
    ctx.fillStyle = 'rgba(250,246,238,0.7)';
    const ry = land ? y0 + bh + Math.min(46 * u, (H - y0 - bh) * 0.6) : y0 + bh + 50 * u;
    drawTracked(ctx, right, W - x, ry, fs * 0.2, 'right');
  }
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------- 매거진 (에디토리얼)
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/(\s+)/);
  const lines = [];
  let cur = '';
  const push = (s) => {
    if (lines.length < maxLines) lines.push(s);
  };
  for (const w of words) {
    const test = cur + w;
    if (ctx.measureText(test).width <= maxW || !cur.trim()) {
      // 띄어쓰기 없는 긴 글자는 글자 단위로 자름
      if (ctx.measureText(test).width > maxW) {
        let buf = cur;
        for (const ch of Array.from(w)) {
          if (ctx.measureText(buf + ch).width > maxW && buf) {
            push(buf);
            buf = ch;
          } else buf += ch;
        }
        cur = buf;
      } else cur = test;
    } else {
      push(cur.trim());
      cur = w.trimStart();
    }
  }
  if (cur.trim()) push(cur.trim());
  return lines;
}

export function drawEditorial(ctx, seg, tau, env, a) {
  const { W, H, u, theme, typo } = env;
  const land = W >= H;
  const t = photoText(seg.item);
  const big = t.big || '';
  const caption = t.caption || (t.label && big !== t.label ? t.label : '');
  const eyebrow = (t.folder && t.folder !== big ? t.folder : '') || t.date || '';
  // 종이 배경
  const paper = theme.dark ? theme.bg[1] : theme.bg[0];
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  const flip = hashStr(seg.key) % 2 === 1; // 사진을 왼쪽/오른쪽 번갈아
  // 사진 패널: 가장자리에서 밀려 나오듯 드러남
  const rev = easeOutQuart(prog(tau, 0, Math.max(0.7, seg.tIn + 0.35)));
  let px, py, pw, ph;
  if (land) {
    pw = W * 0.56;
    ph = H;
    px = flip ? 0 : W - pw;
    py = 0;
  } else {
    pw = W;
    ph = H * 0.58;
    px = 0;
    py = 0;
  }
  ctx.save();
  ctx.beginPath();
  if (land) {
    const vis = pw * lerp(0.35, 1, rev);
    ctx.rect(flip ? px : px + pw - vis, py, vis, ph);
  } else ctx.rect(px, py, pw, ph * lerp(0.35, 1, rev));
  ctx.clip();
  kenBurnsIn(ctx, a, seg, tau, px, py, pw, ph, 0.7);
  ctx.restore();
  // 글자 영역
  const tx = land ? (flip ? pw + W * 0.06 : W * 0.07) : W * 0.08;
  const tw = land ? W - pw - W * 0.13 : W * 0.84;
  const top = land ? H * 0.22 : ph + H * 0.05;
  const inS = seg.tIn * 0.5 + 0.15;
  const outE = seg.dur - seg.tOut * 0.5;
  const al = inOut(tau, inS, inS + 0.7, Math.max(inS + 1, outE - 0.5), outE);
  if (al <= 0.001) return true;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  let y = top;
  const ink = theme.dark ? theme.text : theme.text;
  if (eyebrow) {
    const fs = fitFontSize(ctx, typo.eyebrow, eyebrow, 24 * u, tw, 0.2);
    setFont(ctx, typo.eyebrow, fs, Math.max(600, typo.eyebrow.weight));
    ctx.globalAlpha = al;
    ctx.fillStyle = theme.accentSolid;
    drawTracked(ctx, eyebrow.toUpperCase(), tx, y, fs * 0.2, 'left');
    y += fs * 1.2;
  }
  if (big) {
    const fs = fitFontSize(ctx, typo.display, big, (/^\d{4}$/.test(big) ? 220 : 120) * u, tw, 0.01);
    setFont(ctx, typo.display, fs, typo.display.weight);
    y += fs * 0.92;
    const e2 = easeOutCubic(prog(tau, inS + 0.1, inS + 0.9));
    ctx.save();
    ctx.globalAlpha = al * e2;
    ctx.beginPath();
    ctx.rect(tx - 10 * u, y - fs * 1.05, tw + 20 * u, fs * 1.3);
    ctx.clip();
    ctx.fillStyle = theme.dark ? accentGradient(ctx, theme, y - fs * 0.8, y + fs * 0.1) : ink;
    drawTracked(ctx, big, tx, y + (1 - e2) * fs * 0.6, fs * 0.01, 'left');
    ctx.restore();
    y += fs * 0.32;
  }
  // 가는 선
  const le = easeOutCubic(prog(tau, inS + 0.35, inS + 1.1));
  ctx.globalAlpha = al;
  ctx.fillStyle = theme.accentSolid;
  ctx.fillRect(tx, y, Math.min(tw, 120 * u) * le, Math.max(1, 2 * u));
  y += 54 * u;
  if (caption) {
    const fs = Math.max(22 * u, Math.min(38 * u, tw / 14));
    setFont(ctx, typo.body, fs, Math.max(400, typo.body.weight));
    const lines = wrapLines(ctx, caption, tw, land ? 4 : 3);
    ctx.fillStyle = theme.dark ? theme.textDim : theme.textDim;
    lines.forEach((ln, i) => {
      const ce = easeOutCubic(prog(tau, inS + 0.5 + i * 0.12, inS + 1.1 + i * 0.12));
      ctx.globalAlpha = al * ce;
      ctx.fillText(ln, tx, y + i * fs * 1.55 + (1 - ce) * 10 * u);
    });
    y += lines.length * fs * 1.55;
  }
  // 아래쪽 쪽번호 장식 (잡지 느낌)
  const no = String((seg.index || 0) % 100).padStart(2, '0');
  setFont(ctx, typo.eyebrow, 18 * u, Math.max(500, typo.eyebrow.weight));
  ctx.globalAlpha = al * 0.55;
  ctx.fillStyle = ink;
  const by = land ? H - 64 * u : H - 54 * u;
  drawTracked(ctx, `— ${no}`, tx, by, 4 * u, 'left');
  ctx.restore();
  return true;
}
