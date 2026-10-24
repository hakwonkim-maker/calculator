// E2E: 실제 Electron 앱 실행 → 폴더 가져오기 → 음악 → 720p 내보내기 → 결과 검증
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = process.env.MF_FIXTURES || path.join(root, 'fixtures');
const musicDir = path.join(root, 'fixtures');
const big = !!process.env.MF_FIXTURES;
const outFile = path.join(root, 'out', 'e2e.mp4');
fs.rmSync(outFile, { force: true });

const app = await _electron.launch({ executablePath: process.env.MF_EXE || path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'), args: [...(process.env.MF_EXE ? [] : [path.join(root, '..')]), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } });
await app.evaluate(({ dialog }, { fixtures, outFile, musicDir }) => {
  dialog.showOpenDialog = async (_w, opts) => {
    const props = opts?.properties || _w?.properties || [];
    const title = opts?.title || '';
    if (props.includes('openDirectory')) return { canceled: false, filePaths: [fixtures] };
    if (title.includes('음악')) return { canceled: false, filePaths: [musicDir + '/music_a.mp3', musicDir + '/music_b.mp3'] };
    return { canceled: true, filePaths: [] };
  };
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: outFile });
}, { fixtures, outFile, musicDir });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await win.waitForSelector('.tpl-modal');
await win.click(big ? '.tpl-grid .pcard:has-text("창립")' : '.tpl-grid .pcard:has-text("행사 하이라이트")');
await win.waitForSelector('.empty-card');
await win.click('.empty-card .btn-primary');
const tImp = Date.now();
await win.waitForSelector('.card-slot', { timeout: 120000 });
await win.waitForTimeout(1500);
console.log('photos:', await win.$$eval('.card-slot', (e) => e.length), 'import ms', Date.now() - tImp);
if (big) {
  await win.click('.step:has-text("사진")');
  // 전체 길이 1분으로 고정
  await win.click('button:has-text("전체 길이 정하기")');
  await win.click('.chip:has-text("2분")');
  await win.waitForTimeout(500);
  console.log('length result:', (await win.textContent('.len-result')).replace(/\s+/g, ' '));
  // 필름스트립 끝까지 스크롤 + 재생 중 UI 반응성 측정
  const t0 = Date.now();
  await win.evaluate(() => { const f = document.querySelector('.filmstrip'); f.scrollLeft = f.scrollWidth; });
  await win.keyboard.press('Space');
  await win.waitForTimeout(3000);
  const lag = await win.evaluate(() => new Promise((res) => { const s = performance.now(); setTimeout(() => res(performance.now() - s), 0); }));
  await win.keyboard.press('Space');
  console.log('scroll+play ms', Date.now() - t0, 'event-loop lag ms', lag.toFixed(1));
  await win.screenshot({ path: path.join(root, 'out', 'e2e_big.png') });
}
// 캡션 입력
await win.click('.card-slot >> nth=0');
await win.fill('.inspector input >> nth=0', '1996');
await win.fill('.inspector input >> nth=1', '창립 기념식');
// 음악
await win.click('.step:has-text("음악")');
await win.click('button:has-text("음악 파일 추가")');
await win.waitForSelector('.track >> nth=1', { timeout: 20000 });
await win.waitForTimeout(800);
if (!big) await win.click('button:has-text("음악 길이에 영상 맞추기")');
await win.waitForTimeout(500);
await win.screenshot({ path: path.join(root, 'out', 'e2e_music.png') });
// 내보내기
await win.click('.step:has-text("내보내기")');
if (!big) await win.click('.aspect:has-text("세로 9:16")');
await win.click('.res:has-text("HD 720p")');
await win.screenshot({ path: path.join(root, 'out', 'e2e_export.png') });
const t0 = Date.now();
await win.click('.panel .btn-primary:has-text("영상 파일 만들기")');
await win.waitForSelector('.export-modal');
await win.waitForTimeout(8000);
await win.screenshot({ path: path.join(root, 'out', 'e2e_exporting.png') });
console.log('encoder line:', (await win.textContent('.export-modal')).match(/인코딩: [^·]*/)?.[0] || '(n/a)');
await win.waitForSelector('.done-badge, .error-box', { timeout: 1700000 });
console.log('export seconds', ((Date.now() - t0) / 1000).toFixed(1));
await win.screenshot({ path: path.join(root, 'out', 'e2e_done.png') });
const err = await win.$('.error-box');
if (err) console.log('EXPORT ERROR:', await err.textContent());
if (!big && !err) {
  await win.click('.modal-actions button:has-text("닫기")');
  const t1 = Date.now();
  await win.click('button:has-text("빠른 시안 먼저 만들기")');
  await win.waitForSelector('.done-badge, .error-box', { timeout: 900000 });
  console.log('draft seconds', ((Date.now() - t1) / 1000).toFixed(1), (await win.$('.error-box')) ? 'ERROR' : 'ok');
  await win.click('.modal-actions button:has-text("닫기")');
  console.log('export panel ETA:', (await win.textContent('.panel')).match(/예상 제작 시간[^)]*\)?/)?.[0]);
}
console.log('page errors:', errors.length ? JSON.stringify(errors).slice(0, 1500) : 'none');
await app.close();
