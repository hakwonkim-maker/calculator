// UI 스모크 테스트: 웹 모드로 앱을 띄워 사진을 넣고 각 단계를 캡처
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'out');
const server = await createServer({ configFile: path.join(root, '..', 'vite.config.js'), server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1480, height: 920 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto('http://localhost:5197/');
await p.waitForTimeout(1500);
await p.screenshot({ path: path.join(out, 'ui_empty.png') });
const files = fs.readdirSync(path.join(root, 'fixtures')).filter((f) => f.endsWith('.jpg')).map((f) => path.join(root, 'fixtures', f));
await p.setInputFiles('input[type=file][accept="image/*"]', files);
await p.waitForTimeout(2500);
await p.mouse.click(700, 300); // 미리보기 클릭 → 재생
await p.waitForTimeout(300);
await p.keyboard.press('Space');
await p.waitForTimeout(500);
// 두 번째 사진 선택
const cards = await p.$$('.card-slot .card');
await cards[1].click();
await p.waitForTimeout(3000);
await p.screenshot({ path: path.join(out, 'ui_photos.png') });
for (const [label, name] of [['문구', 'text'], ['스타일', 'style'], ['음악', 'music'], ['내보내기', 'export']]) {
  await p.click(`.step:has-text("${label}")`);
  await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(out, `ui_${name}.png`) });
}
// 전환 메뉴
await p.click('.tchip >> nth=2');
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(out, 'ui_tmenu.png') });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
await server.close();
