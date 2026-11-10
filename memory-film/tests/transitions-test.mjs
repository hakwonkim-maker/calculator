// 새 전환 효과 시각 검증: 각 전환의 50% 지점 프레임 저장
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const ids = (process.argv[2] || 'heart,cube,dots,blinds,filmBurn,glitch,slideUp,softWipe').split(',');
const photos = fs.readdirSync(path.join(root, 'fixtures')).filter((f) => f.endsWith('.jpg')).sort();
const items = ids.concat(['fade']).map((t, i) => ({ id: 'p' + i, type: 'photo', path: '/@fs' + path.join(root, 'fixtures', photos[i % photos.length]), transition: t }));
const proj = { intro: { enabled: false }, outro: { enabled: false }, items, style: { theme: 'noir', look: 'natural', grain: 0, transitionDuration: 1.4 } };
const server = await createServer({ configFile: path.join(root, '..', 'vite.config.js'), server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5196/harness.html');
await p.waitForFunction(() => window.ready);
const info = await p.evaluate(([pr]) => window.setup(pr, 960, 540), [proj]);
for (const s of info.segs.slice(1)) {
  const t = s.start + s.tIn * 0.5;
  const url = await p.evaluate((t) => window.frame(t), t);
  fs.writeFileSync(path.join(root, 'out', `tr_${s.trans}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(info.segs.slice(1).map((s) => s.trans).join(','));
await b.close();
await server.close();
