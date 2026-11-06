// 렌더링 엔진 시각 검증: 지정한 시간의 프레임을 이미지로 저장
// 사용법: node tests/render-test.mjs [scenario]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'out');
fs.mkdirSync(out, { recursive: true });
const FIX = process.env.FIX || 'fixtures';
const fx = (n) => '/@fs' + path.join(root, FIX, n);
const photos = fs.readdirSync(path.join(root, FIX)).filter((f) => f.endsWith('.jpg')).sort().slice(0, +(process.env.N || 999));

const scenario = process.argv[2] || 'golden';
const times = (process.argv[3] || '').split(',').filter(Boolean).map(Number);

const items = [];
photos.forEach((p, i) => {
  if (i === 2) items.push({ id: 'ch1', type: 'chapter', title: '1996', subtitle: '작은 시작, 큰 꿈' });
  const folder = process.env.FOLDERS ? ['01_1996 창립', '2005_사옥 이전', '3. 2019 체육대회'][Math.floor((i * 3) / photos.length)] : undefined;
  items.push({ id: 'p' + i, type: 'photo', path: fx(p), folder, caption: i === 0 ? '창립 기념식 · 서울 본사' : '', label: i === 0 ? '1996' : '' });
});

const base = {
  text: { org: '주식회사 메모리아', number: '30', title: '함께 걸어온 30년', subtitle: '1996 — 2026', startYear: 1996, endYear: 2026 },
  items,
};
const scenarios = {
  golden: { intro: { style: 'golden', duration: 10 }, style: { theme: 'noir', typography: 'classic' } },
  mosaic: { intro: { style: 'mosaic', duration: 10 }, style: { theme: 'navy', typography: 'modern' } },
  light: { intro: { style: 'light', duration: 10 }, style: { theme: 'ivory', typography: 'warm' } },
  royal: { intro: { style: 'golden', duration: 10 }, style: { theme: 'burgundy', typography: 'royal' } },
  cinematic: { intro: { style: 'cinematic', duration: 10 }, style: { theme: 'navy', typography: 'royal' }, outro: { style: 'credits' }, textx: { credits: '# 함께한 사람들\n기획\t홍길동\n진행\t김철수\n\n촬영 : 이영희\n모든 임직원 여러분' } },
  polaroid: { intro: { style: 'polaroid', duration: 10 }, style: { theme: 'sage', typography: 'diary' } },
  bloom: { intro: { style: 'bloom', duration: 11 }, style: { theme: 'rose', typography: 'romantic' }, textx: { number: '', eyebrow: 'Our Wedding Day', title: '민준 그리고 서연', subtitle: '2026. 10. 24' } },
  minimal: { intro: { style: 'minimal', duration: 10 }, style: { theme: 'sky', typography: 'playful', captionPos: 'center', watermark: true } },
  leader: { intro: { style: 'filmleader', duration: 11 }, style: { theme: 'ivory', typography: 'warm' } },
  vertical: { intro: { style: 'golden', duration: 10 }, style: { theme: 'noir', typography: 'classic', captionPos: 'center' }, w: 1080, h: 1920 },
  timeroll: { intro: { style: 'timeroll', duration: 10 }, style: { theme: 'noir', typography: 'classic', montage: 'many' } },
  flashcut: { intro: { style: 'flashcut', duration: 10 }, style: { theme: 'navy', typography: 'modern', montage: 'many' } },
  timerollIvory: { intro: { style: 'timeroll', duration: 10, photoPhase: 1.6 }, style: { theme: 'ivory', typography: 'warm' } },
  montage: { intro: { style: 'golden', duration: 10 }, style: { theme: 'noir', typography: 'classic', montage: 'many', folderLabel: 'all' }, transitionStyle: 'elegant' },
  credit: { intro: { style: 'golden', duration: 10 }, style: { theme: 'noir', typography: 'classic' }, music: { tracks: [{ path: 'x.m4a', duration: 120, needsCredit: true, credit: '"Carefree" Kevin MacLeod (incompetech.com) · Licensed under CC BY 4.0' }, { path: 'y.m4a', duration: 90, needsCredit: true, credit: '"Pamgaea" Kevin MacLeod (incompetech.com) · Licensed under CC BY 4.0' }] } },
  creditNoOutro: { intro: { style: 'golden', duration: 10 }, outro: { enabled: false }, style: { theme: 'ivory', typography: 'warm' }, music: { tracks: [{ path: 'x.m4a', duration: 120, needsCredit: true, credit: '"Carefree" Kevin MacLeod (incompetech.com) · Licensed under CC BY 4.0' }] } },
  restoreOff: { intro: { enabled: false }, outro: { enabled: false }, style: { theme: 'noir', typography: 'classic', enhance: 'off', motion: 'none', montage: 'off', look: 'natural', vignette: 0, grain: 0 } },
  restoreOn: { intro: { enabled: false }, outro: { enabled: false }, style: { theme: 'noir', typography: 'classic', enhance: 'old', motion: 'none', montage: 'off', look: 'natural', vignette: 0, grain: 0 } },
  manual: { intro: { enabled: false }, outro: { enabled: false }, style: { theme: 'noir', typography: 'classic', montage: 'off', motion: 'none' }, manual: [[0, 2, 'grid'], [2, 3, 'polaroid'], [5, 7, 'grid'], [12, 8, 'split'], [20, 2, 'polaroid'], [22, 3, 'grid'], [25, 8, 'polaroid'], [33, 6, 'split']] },
  // v1.8 새 몽타주 6종 (2~8장) — 'groups' 시간 지정 시 각 몽타주 장면을 여러 시점에서 저장
  montages2: { intro: { enabled: false }, outro: { enabled: false }, dates: true, style: { theme: 'noir', typography: 'classic', montage: 'off', motion: 'none' }, manual: [[0, 4, 'scrapbook'], [4, 4, 'stack'], [8, 5, 'gallery'], [13, 4, 'diagonal'], [17, 6, 'bento'], [23, 6, 'timeline'], [29, 2, 'scrapbook'], [31, 8, 'bento']] },
  montages2b: { intro: { enabled: false }, outro: { enabled: false }, dates: true, style: { theme: 'ivory', typography: 'diary', montage: 'off', motion: 'none' }, manual: [[0, 8, 'scrapbook'], [8, 2, 'stack'], [10, 8, 'gallery'], [18, 8, 'diagonal'], [26, 2, 'bento'], [28, 3, 'timeline'], [31, 8, 'timeline']] },
  montages2v: { intro: { enabled: false }, outro: { enabled: false }, dates: true, w: 1080, h: 1920, style: { theme: 'navy', typography: 'modern', montage: 'off', motion: 'none' }, manual: [[0, 5, 'scrapbook'], [5, 4, 'stack'], [9, 5, 'gallery'], [14, 4, 'diagonal'], [18, 6, 'bento'], [24, 6, 'timeline']] },
  // v1.8 사진 장면 레이아웃 7종 (사진마다 지정) + 박자 강조
  layouts: { intro: { enabled: false }, outro: { enabled: false }, dates: true, layouts: true, style: { theme: 'noir', typography: 'classic', montage: 'off', folderLabel: 'change' } },
  layoutsIvory: { intro: { enabled: false }, outro: { enabled: false }, dates: true, layouts: true, style: { theme: 'ivory', typography: 'modern', montage: 'off' } },
  layoutsV: { intro: { enabled: false }, outro: { enabled: false }, dates: true, layouts: true, w: 1080, h: 1920, style: { theme: 'navy', typography: 'royal', montage: 'off' } },
  montages2sq: { intro: { enabled: false }, outro: { enabled: false }, dates: true, w: 1080, h: 1080, style: { theme: 'noir', typography: 'classic', montage: 'off', motion: 'none' }, manual: [[0, 5, 'scrapbook'], [5, 4, 'stack'], [9, 5, 'gallery'], [14, 4, 'diagonal'], [18, 6, 'bento'], [24, 6, 'timeline']] },
  layouts45: { intro: { enabled: false }, outro: { enabled: false }, dates: true, layouts: true, w: 1080, h: 1350, style: { theme: 'noir', typography: 'classic', montage: 'off', folderLabel: 'change' } },
  square: { intro: { style: 'mosaic', duration: 10 }, style: { theme: 'navy', typography: 'modern' }, w: 1080, h: 1080 },
};
const sc = scenarios[scenario];
// 직접 만든 몽타주: [시작(사진 순번), 장수, 효과]
if (sc.manual) {
  const ph = items.filter((i) => i.type === 'photo');
  sc.manual.forEach(([a, n, st], g) => ph.slice(a, a + n).forEach((it) => Object.assign(it, { mg: 'm' + g, mgStyle: st, caption: '', label: '' })));
}
if (sc.dates) items.filter((i) => i.type === 'photo').forEach((it, k) => Object.assign(it, { date: Date.UTC(1996 + Math.floor(k / 2) * 3, (k * 5) % 12, 1 + k), dateSource: 'exif' }));
if (sc.layouts) {
  const L = ['full', 'framed', 'editorial', 'reveal', 'punch', 'cinema', 'circle', 'editorial', 'cinema'];
  const caps = ['창립 기념식 · 서울 본사', '', '첫 해외 진출을 축하하며 온 가족이 모였던 날, 모두가 웃었던 그 순간', '', '', '새 사옥 준공식', '', '', ''];
  items.filter((i) => i.type === 'photo').forEach((it, k) => Object.assign(it, { layout: L[k % L.length], caption: caps[k % caps.length], label: k % 9 === 5 ? '2005' : '', folder: k < 9 ? '2005_사옥 이전' : '2019 체육대회' }));
}
const proj = { ...base, ...sc, text: { ...base.text, ...(sc.textx || {}) }, style: { ...sc.style } };

const server = await createServer({ configFile: path.join(root, '..', 'vite.config.js'), server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/harness.html');
await page.waitForFunction(() => window.ready);
const info = await page.evaluate(([p, w, h]) => window.setup(p, w, h), [proj, sc.w || 1920, sc.h || 1080]);
console.log('total', info.total.toFixed(2), JSON.stringify(info.segs.map((s) => [s.type, +s.start.toFixed(2), s.trans])));
const groupsMode = process.argv[3] === 'groups';
const photosMode = process.argv[3] === 'photos';
const ts = photosMode ? info.segs.filter((s) => s.type === 'photo').flatMap((s) => [0.12, 0.35, 0.6].map((f) => +(s.start + s.dur * f).toFixed(2))) : groupsMode ? info.segs.filter((s) => s.type === 'group').flatMap((s) => [0.25, 0.5, 0.75, 0.95].map((f) => +(s.start + s.dur * f).toFixed(2))) : times.length ? times : [0.6, 2, 3.5, 5, 7, 9.2, 10.5, 13, 14.6, 18, info.total - 6, info.total - 3, info.total - 1];
for (const t of ts) {
  const t0 = Date.now();
  const url = await page.evaluate((t) => window.frame(t), t);
  fs.writeFileSync(path.join(out, `${scenario}_${t.toFixed(2)}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('frame', t.toFixed(2), Date.now() - t0, 'ms');
}
await browser.close();
await server.close();
