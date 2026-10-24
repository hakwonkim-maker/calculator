// 대량 사진 메모리·속도 검증: 사진 N장을 1080p 출력 렌더러로 한 장씩 모두 렌더
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, 'fixtures-big');
const photos = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
const items = photos.map((f, i) => ({ id: 'p' + i, type: 'photo', path: '/@fs' + path.join(dir, f), caption: i % 7 ? '' : '캡션 ' + i }));
const proj = { items, intro: { enabled: true, style: 'mosaic' }, style: { lengthMode: 'total', targetDuration: 300 } };
const server = await createServer({ configFile: path.join(root, '..', 'vite.config.js'), server: { port: 5195 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5195/harness.html');
await p.waitForFunction(() => window.ready);
const info = await p.evaluate(([pr]) => window.setup(pr, 1920, 1080), [proj]);
const segs = info.segs.filter((s) => s.type === 'photo');
console.log('photos', segs.length, 'total', info.total.toFixed(1));
const t0 = Date.now();
for (let i = 0; i < segs.length; i++) {
  const s = segs[i];
  await p.evaluate((t) => window.pixels(t), s.start + s.dur / 2);
  if (i % 60 === 0 || i === segs.length - 1) {
    const mem = await p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1));
    console.log(`#${i + 1} heapMB=${mem} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
await b.close();
await server.close();
