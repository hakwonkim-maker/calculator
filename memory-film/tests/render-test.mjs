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
  square: { intro: { style: 'mosaic', duration: 10 }, style: { theme: 'navy', typography: 'modern' }, w: 1080, h: 1080 },
};
const sc = scenarios[scenario];
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
const ts = times.length ? times : [0.6, 2, 3.5, 5, 7, 9.2, 10.5, 13, 14.6, 18, info.total - 6, info.total - 3, info.total - 1];
for (const t of ts) {
  const t0 = Date.now();
  const url = await page.evaluate((t) => window.frame(t), t);
  fs.writeFileSync(path.join(out, `${scenario}_${t.toFixed(2)}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('frame', t.toFixed(2), Date.now() - t0, 'ms');
}
await browser.close();
await server.close();
