// GPU YUV420 변환 정확도: RGBA 경로와 PSNR 비교
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'out');
const photos = fs.readdirSync(path.join(root, 'fixtures')).filter((f) => f.endsWith('.jpg')).sort();
const items = photos.map((f, i) => ({ id: 'p' + i, type: 'photo', path: '/@fs' + path.join(root, 'fixtures', f), caption: '색 정확도 테스트', label: '1996' }));
const server = await createServer({ configFile: path.join(root, '..', 'vite.config.js'), server: { port: 5194 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5194/harness.html');
await p.waitForFunction(() => window.ready);
const [W, H] = [1280, 720];
await p.evaluate(([pr, w, h]) => window.setup(pr, w, h), [{ items, style: { grain: 0 } }, W, H]);
for (const t of [5, 13.2]) {
  const r = await p.evaluate((t) => window.compare(t), t);
  fs.writeFileSync('/tmp/claude-0/f.rgba', Buffer.from(r.rgba, 'base64'));
  fs.writeFileSync('/tmp/claude-0/f.yuv', Buffer.from(r.yuv, 'base64'));
  execSync(`ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgba -s ${W}x${H} -i /tmp/claude-0/f.rgba -vf vflip -frames:v 1 ${out}/cmp_rgba_${t}.png`);
  execSync(`ffmpeg -loglevel error -y -f rawvideo -pix_fmt yuv420p -color_range tv -colorspace bt709 -s ${W}x${H} -i /tmp/claude-0/f.yuv -vf scale=in_color_matrix=bt709:in_range=tv:out_range=pc -frames:v 1 ${out}/cmp_yuv_${t}.png`);
  const psnr = execSync(`ffmpeg -hide_banner -i ${out}/cmp_rgba_${t}.png -i ${out}/cmp_yuv_${t}.png -lavfi psnr -f null - 2>&1 | grep -o "average:[0-9.]*"`).toString().trim();
  console.log(`t=${t} format=${r.format} ${psnr}`);
}
await b.close();
await server.close();
