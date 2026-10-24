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
const fx = (n) => '/@fs' + path.join(root, 'fixtures', n);
const photos = fs.readdirSync(path.join(root, 'fixtures')).filter((f) => f.endsWith('.jpg')).sort();

const scenario = process.argv[2] || 'golden';
const times = (process.argv[3] || '').split(',').filter(Boolean).map(Number);

const items = [];
photos.forEach((p, i) => {
  if (i === 2) items.push({ id: 'ch1', type: 'chapter', title: '1996', subtitle: '작은 시작, 큰 꿈' });
  items.push({ id: 'p' + i, type: 'photo', path: fx(p), caption: i === 0 ? '창립 기념식 · 서울 본사' : '', label: i === 0 ? '1996' : '' });
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
};
const proj = { ...base, ...scenarios[scenario], style: { ...scenarios[scenario].style } };

const server = await createServer({ configFile: path.join(root, '..', 'vite.config.js'), server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/harness.html');
await page.waitForFunction(() => window.ready);
const info = await page.evaluate((p) => window.setup(p), proj);
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
