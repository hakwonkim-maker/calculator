// 새 기능 화면 점검용 스크린샷 (Electron, 사진 많은 폴더)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = process.env.MF_FIXTURES || path.join(root, 'fixtures-220');
const shot = (n) => win.screenshot({ path: path.join(root, 'out', `ui_${n}.png`) });
const app = await _electron.launch({ executablePath: path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'), args: [path.join(root, '..'), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')], env: { ...process.env, MF_MUSIC_DIR: fs.mkdtempSync('/tmp/claude-0/mf-music-'), NO_PROXY: '127.0.0.1,localhost' } });
await app.evaluate(({ dialog }, { fixtures }) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixtures] });
}, { fixtures });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.setViewportSize?.({ width: 1440, height: 900 });
await win.waitForSelector('.tpl-modal');
await shot('templates');
await win.click('.tpl-grid .pcard:has-text("창립")');
await win.click('.empty-card .btn-primary');
await win.waitForSelector('.card-slot', { timeout: 120000 });
await win.waitForTimeout(2500);
await win.click('.step:has-text("문구")');
await win.click('.pcard:has-text("메모리 모자이크")');
await win.waitForTimeout(800);
await win.evaluate(() => document.querySelector('.intro-tune')?.scrollIntoView());
await shot('intro_tune');
await win.click('.step:has-text("스타일")');
await win.evaluate(() => [...document.querySelectorAll('.section h3')].find((h) => h.textContent.includes('몽타주'))?.scrollIntoView());
await win.click('.segmented button:has-text("폴더가 바뀔 때만")');
await shot('style');
// 몽타주 사진 선택 → 인스펙터
const idx = await win.$$eval('.card-slot', (els) => els.findIndex((e) => e.querySelector('.card-montage')));
console.log('first montage card index', idx, 'montage cards', await win.$$eval('.card-montage', (e) => e.length));
if (idx >= 0) {
  await win.evaluate((i) => document.querySelectorAll('.card-slot')[i].scrollIntoView({ inline: 'center' }), idx);
  await win.click(`.card-slot >> nth=${idx}`);
  await win.waitForTimeout(1500);
  await shot('montage_inspector');
  console.log('scene label:', await win.evaluate(() => document.body.innerText.match(/몽타주 · [^\n]*/)?.[0]));
}
await win.click('.step:has-text("음악")');
await win.waitForTimeout(600);
if (process.env.MF_MUSIC_SITE) {
  await win.click('.lib button:has-text("인터넷에서 무료 음악")');
  await win.waitForSelector('.lib-row', { timeout: 30000 });
  await win.click('.lib-row >> nth=2 >> .lib-play');
  await win.waitForTimeout(2500);
}
await shot('music');
await win.click('.top-actions button:has-text("새로 만들기")');
await win.waitForSelector('.confirm-modal');
await shot('new_confirm');
console.log('errors:', errors.length ? errors.join(' | ').slice(0, 800) : 'none');
await app.close();
