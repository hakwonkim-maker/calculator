// E2E: 실제 Electron 앱 실행 → 폴더 가져오기 → 음악 → 720p 내보내기 → 결과 검증
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(root, 'fixtures');
const outFile = path.join(root, 'out', 'e2e.mp4');
fs.rmSync(outFile, { force: true });

const app = await _electron.launch({ executablePath: process.env.MF_EXE || path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'), args: [...(process.env.MF_EXE ? [] : [path.join(root, '..')]), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } });
await app.evaluate(({ dialog }, { fixtures, outFile }) => {
  dialog.showOpenDialog = async (_w, opts) => {
    const props = opts?.properties || _w?.properties || [];
    const title = opts?.title || '';
    if (props.includes('openDirectory')) return { canceled: false, filePaths: [fixtures] };
    if (title.includes('음악')) return { canceled: false, filePaths: [fixtures + '/music_a.mp3', fixtures + '/music_b.mp3'] };
    return { canceled: true, filePaths: [] };
  };
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: outFile });
}, { fixtures, outFile });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await win.waitForSelector('.empty-card');
await win.click('.empty-card .btn-primary');
await win.waitForSelector('.card-slot', { timeout: 30000 });
await win.waitForTimeout(1500);
console.log('photos:', await win.$$eval('.card-slot', (e) => e.length));
// 캡션 입력
await win.click('.card-slot >> nth=0');
await win.fill('.inspector input >> nth=0', '1996');
await win.fill('.inspector input >> nth=1', '창립 기념식');
// 음악
await win.click('.step:has-text("음악")');
await win.click('button:has-text("음악 파일 추가")');
await win.waitForSelector('.track >> nth=1', { timeout: 20000 });
await win.waitForTimeout(800);
await win.click('button:has-text("음악 길이에 영상 맞추기")');
await win.waitForTimeout(500);
await win.screenshot({ path: path.join(root, 'out', 'e2e_music.png') });
// 내보내기
await win.click('.step:has-text("내보내기")');
await win.click('.res:has-text("HD 720p")');
await win.screenshot({ path: path.join(root, 'out', 'e2e_export.png') });
const t0 = Date.now();
await win.click('.panel .btn-primary:has-text("영상 만들기")');
await win.waitForSelector('.export-modal');
await win.waitForTimeout(8000);
await win.screenshot({ path: path.join(root, 'out', 'e2e_exporting.png') });
await win.waitForSelector('.done-badge, .error-box', { timeout: 900000 });
console.log('export seconds', ((Date.now() - t0) / 1000).toFixed(1));
await win.screenshot({ path: path.join(root, 'out', 'e2e_done.png') });
const err = await win.$('.error-box');
if (err) console.log('EXPORT ERROR:', await err.textContent());
console.log('page errors:', errors.length ? errors : 'none');
await app.close();
