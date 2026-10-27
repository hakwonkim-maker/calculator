// 가상 사용자 시뮬레이션: 실제 Electron 앱을 사람처럼 클릭해 영상까지 만들고, 클릭 수·시간·오류를 기록
// 사용법: xvfb-run -a node tests/persona-sim.mjs <A|B|C> <사진폴더>
//  A 김부장(초보·30주년 담당): 템플릿 → 폴더 → '3분 영상으로 좋은 사진만' → 기관명 → 무료 음악 → 영상 만들기
//  B 이대리(행사 영상·꼼꼼): 플래시 컷 인트로 조정, 대표 사진, 몽타주 자주, 폴더명, 1분·2초 선별, 세로 9:16 시안
//  C 박선생(옛 사진 정리): 촬영일순 → 연도 챕터 → 폴더명(바뀔 때만) → 타임 롤 → 2분·4초 선별 → 시안
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const who = process.argv[2] || 'A';
const folder = process.argv[3];
const out = path.join(root, 'out', `persona_${who}.mp4`);
fs.rmSync(out, { force: true });

const app = await _electron.launch({
  executablePath: process.env.MF_EXE || path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'),
  args: [...(process.env.MF_EXE ? [] : [path.join(root, '..')]), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')],
  env: { ...process.env, MF_MUSIC_DIR: fs.mkdtempSync('/tmp/claude-0/mf-music-'), NO_PROXY: '127.0.0.1,localhost' },
});
await app.evaluate(({ dialog }, { folder, out }) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: out });
}, { folder, out });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
let clicks = 0;
const t0 = Date.now();
const log = (...a) => console.log(`[${who} ${((Date.now() - t0) / 1000).toFixed(0)}s · ${clicks}클릭]`, ...a);
const click = async (sel, opts) => {
  clicks++;
  await win.click(sel, { timeout: 30000, ...opts });
};
const type = async (sel, text) => {
  clicks++;
  await win.fill(sel, text);
};
const shot = (n) => win.screenshot({ path: path.join(root, 'out', `persona_${who}_${n}.png`) });
const toastAction = async (label, timeout = 15000) => {
  await win.waitForSelector(`.toast button:has-text("${label}")`, { timeout });
  await click(`.toast button:has-text("${label}")`);
};
const waitBusy = async () => {
  await win.waitForTimeout(300);
  await win.waitForSelector('.busy-modal', { state: 'detached', timeout: 600000 });
};
const status = async () => (await win.textContent('.stat-row').catch(() => '')).replace(/\s+/g, ' ');
const exportVideo = async (draft) => {
  await click('.step:has-text("내보내기")');
  if (draft) await click('button:has-text("빠른 시안 먼저 만들기")');
  else await click('.panel .btn-primary:has-text("영상 파일 만들기")');
  await win.waitForSelector('.export-modal');
  const te = Date.now();
  await win.waitForSelector('.done-badge, .error-box', { timeout: 1800000 });
  const err = await win.$('.error-box');
  log(err ? 'EXPORT ERROR ' + (await err.textContent()) : `영상 완성 (${((Date.now() - te) / 1000).toFixed(0)}초)`);
  await shot('done');
};

await win.waitForSelector('.tpl-modal');
if (who === 'A') {
  await click('.tpl-grid .pcard:has-text("창립")');
  await click('.empty-card .btn-primary');
  await win.waitForSelector('.card-slot', { timeout: 120000 });
  log('사진 불러옴', await status());
  await toastAction('3분 영상으로 좋은 사진만 고르기');
  await waitBusy();
  await win.waitForTimeout(500);
  log('자동 선별 후', await status(), '|', (await win.textContent('.len-result').catch(() => '')).replace(/\s+/g, ' '));
  await shot('selected');
  await click('.step:has-text("문구")');
  await type('input[placeholder="예) 주식회사 ○○○"]', '주식회사 메모리아');
  await click('.step:has-text("음악")');
  await win.waitForSelector('.lib-row', { timeout: 30000 }).catch(() => {});
  if (await win.$('.lib-row')) {
    await click('.lib-row >> nth=0 >> button:has-text("넣기")');
    await win.waitForSelector('.lib-used', { timeout: 30000 });
  }
  log('음악', (await win.textContent('.track-list')).replace(/\s+/g, ' ').slice(0, 60));
  await shot('music');
  await exportVideo(true);
} else if (who === 'B') {
  await click('.tpl-grid .pcard:has-text("행사 하이라이트")');
  await click('.empty-card .btn-primary');
  await win.waitForSelector('.card-slot', { timeout: 120000 });
  // 대표 사진 3장: Ctrl+클릭
  await click('.card-slot >> nth=30');
  await click('.card-slot >> nth=60', { modifiers: ['Control'] });
  await click('.card-slot >> nth=120', { modifiers: ['Control'] });
  await click('.inspector button:has-text("대표 사진으로")');
  await click('.step:has-text("문구")');
  await click('.pcard:has-text("플래시 컷")');
  await win.waitForSelector('.intro-tune');
  // '글자 전에 사진만 보이는 시간' 슬라이더를 끝까지 (키보드)
  clicks++;
  await win.focus('.intro-tune input[type=range] >> nth=0');
  for (let i = 0; i < 12; i++) await win.keyboard.press('ArrowRight');
  log('인트로 조정', (await win.textContent('.intro-tune .slider-top')).replace(/\s+/g, ' '));
  await shot('intro');
  await click('.step:has-text("스타일")');
  await click('.segmented button:has-text("자주")');
  await click('.segmented button:has-text("모든 사진")');
  await click('.step:has-text("사진")');
  await click('button:has-text("전체 길이 정하기")');
  await click('.chip:has-text("1분")');
  await click('.autosel .segmented button:has-text("2초")');
  await click('.autosel button:has-text("자동 선별 적용")');
  await waitBusy();
  await win.waitForTimeout(500);
  log('자동 선별 후', await status());
  await shot('selected');
  await click('.step:has-text("내보내기")');
  await click('.aspect:has-text("세로 9:16")');
  await exportVideo(true);
} else {
  await click('.tpl-grid .pcard:has-text("가족")');
  await click('.empty-card .btn-primary');
  await win.waitForSelector('.card-slot', { timeout: 120000 });
  await click('button:has-text("촬영일순")');
  await win.waitForTimeout(400);
  const order = await win.$$eval('.card-slot .card', (e) => e.slice(0, 10).map((x) => x.title));
  log('정렬 앞부분', order.join(', '));
  await click('button:has-text("연도별 챕터")');
  log('챕터', await win.$$eval('.card-chapter b', (e) => e.map((x) => x.textContent).join(',')));
  await click('.step:has-text("스타일")');
  await click('.segmented button:has-text("폴더가 바뀔 때만")');
  await click('.step:has-text("문구")');
  await click('.pcard:has-text("타임 롤")');
  await click('.step:has-text("사진")');
  await click('button:has-text("전체 길이 정하기")');
  await click('.chip:has-text("2분")');
  await click('.autosel .segmented button:has-text("4초")');
  await click('.autosel button:has-text("자동 선별 적용")');
  await waitBusy();
  await win.waitForTimeout(500);
  log('자동 선별 후', await status());
  await shot('selected');
  await exportVideo(true);
}
log('완료 · 페이지 오류:', errors.length ? errors.join(' | ').slice(0, 600) : '없음');
await app.close();
