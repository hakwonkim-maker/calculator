// UI 스모크 테스트: 웹 모드로 앱을 띄워 템플릿 → 사진 → 각 단계를 캡처
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'out');
const shot = (p, n) => p.screenshot({ path: path.join(out, `ui_${n}.png`) });
const server = await createServer({ configFile: path.join(root, '..', 'vite.config.js'), server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1480, height: 920 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto('http://localhost:5197/');
await p.waitForSelector('.tpl-modal');
await p.waitForTimeout(9000); // 썸네일 렌더 대기
await shot(p, 'templates');
await p.click('.tpl-grid .pcard:has-text("웨딩")');
await p.waitForTimeout(800);
const files = fs.readdirSync(path.join(root, 'fixtures')).filter((f) => f.endsWith('.jpg')).map((f) => path.join(root, 'fixtures', f));
await p.setInputFiles('input[type=file][accept="image/*"]', files);
await p.waitForTimeout(6000);
await shot(p, 'text');
await p.click('.step:has-text("스타일")');
await p.waitForTimeout(600);
await shot(p, 'style');
// 사진 선택 → 인스펙터
await p.click('.card-slot .card >> nth=1');
await p.waitForTimeout(1500);
await p.click('.focus-box', { position: { x: 40, y: 30 } });
await p.click('.chip:has-text("← 이동")');
await p.waitForTimeout(1200);
await shot(p, 'inspector');
// 전환 메뉴 → 하트
await p.click('.tchip >> nth=2');
await p.waitForTimeout(400);
await shot(p, 'tmenu');
await p.click('.tmenu-grid button:has-text("하트")');
await p.waitForTimeout(1500);
// 세로 화면비
await p.click('.step:has-text("내보내기")');
await p.click('.aspect:has-text("세로 9:16")');
await p.waitForTimeout(2500);
await shot(p, 'export_vertical');
// 미리보기 화질 전환 (컨텍스트 손실 버그 회귀 테스트)
await p.click('.preview-opts button:has-text("선명하게")');
await p.waitForTimeout(2000);
await p.click('.preview-opts button:has-text("가볍게")');
await p.waitForTimeout(2000);
const px = await p.evaluate(() => { const c = document.querySelector('.preview-canvas'); const g = c.getContext('webgl2'); return g && !g.isContextLost(); });
console.log('preview context ok after quality switch:', px);
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
await server.close();
