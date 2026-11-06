// 판매용 안전장치 E2E: 안전한 저장(.bak) → 손상 파일 복구, 열기 전 저장 확인, 템플릿 창 닫힘
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync('/tmp/claude-0/mf-safe-');
const proj = path.join(tmp, '테스트.memoria');
const app = await _electron.launch({ executablePath: process.env.MF_EXE || path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'), args: [...(process.env.MF_EXE ? [] : [path.join(root, '..')]), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')], env: { ...process.env, MF_TEST_NO_PROMPT: '1' } });
await app.evaluate(({ dialog }, { fixtures, proj }) => {
  dialog.showOpenDialog = async (_w, o) => ((o || _w)?.title?.includes('프로젝트') ? { canceled: false, filePaths: [proj] } : { canceled: false, filePaths: [fixtures] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: proj });
}, { fixtures: path.join(root, 'fixtures'), proj });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
const ok = (c, m) => console.log(c ? '✓' : '✗', m);
await win.waitForSelector('.tpl-modal');
await win.click('.tpl-grid .pcard >> nth=0');
await win.click('.empty-card .btn-primary');
await win.waitForSelector('.card-slot');
await win.keyboard.press('Control+s');
await win.waitForTimeout(800);
ok(fs.existsSync(proj), '첫 저장');
await win.fill('.project-name', '두번째 저장'); // 입력칸에 커서가 있는 상태에서 Ctrl+S
await win.keyboard.press('Control+s');
await win.waitForTimeout(800);
ok(fs.existsSync(proj + '.bak'), '두 번째 저장 시 .bak 생성');
ok(!fs.existsSync(proj + '.saving'), '임시 파일 남지 않음');
// 파일 손상 → 열기 → .bak 으로 복구
fs.writeFileSync(proj, '{"app":"MEMORIA","proj');
await win.fill('.project-name', '저장 안 한 변경');
await win.click('.top-actions button[title="프로젝트 열기"]');
await win.waitForSelector('.confirm-modal', { timeout: 5000 }).catch(() => {});
ok(!!(await win.$('.confirm-modal')), '저장 안 한 변경이 있으면 열기 전에 확인');
await win.click('.confirm-modal button:has-text("저장 안 함")');
await win.waitForTimeout(1200);
const toasts = await win.$$eval('.toast', (e) => e.map((x) => x.textContent).join(' | '));
ok(/\.bak/.test(toasts), '손상된 파일은 .bak으로 열기: ' + toasts.slice(0, 80));
ok((await win.inputValue('.project-name')).length > 0 && !(await win.$('.tpl-modal')), '프로젝트가 열리고 템플릿 창은 없음');
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await app.close();
