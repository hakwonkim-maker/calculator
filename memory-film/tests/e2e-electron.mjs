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

const app = await _electron.launch({ executablePath: process.env.MF_EXE || path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'), args: [...(process.env.MF_EXE ? [] : [path.join(root, '..')]), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')], env: { ...process.env, MF_TEST_NO_PROMPT: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1', MF_MUSIC_DIR: fs.mkdtempSync('/tmp/claude-0/mf-music-'), NO_PROXY: '127.0.0.1,localhost' } });
await app.evaluate(({ dialog }, { fixtures, outFile, musicDir }) => {
  dialog.showOpenDialog = async (_w, opts) => {
    const props = opts?.properties || _w?.properties || [];
    const title = opts?.title || '';
    if (props.includes('openDirectory')) return { canceled: false, filePaths: [fixtures] };
    if (title.includes('음악')) return { canceled: false, filePaths: [musicDir + '/music_beat.mp3', musicDir + '/music_a.mp3'] };
    return { canceled: true, filePaths: [] };
  };
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: outFile });
}, { fixtures, outFile, musicDir });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text() + (m.location()?.url ? ' @ ' + m.location().url.slice(0, 160) : '')));
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
// 인트로: 새 임팩트 인트로 + 세부 조정
await win.click('.step:has-text("문구")');
await win.click('.pcard:has-text("타임 롤")');
await win.waitForSelector('.intro-tune');
console.log('intro tune:', (await win.textContent('.intro-tune')).replace(/\s+/g, ' ').slice(0, 120));
// 스타일: 폴더 이름 표시 + 몽타주 자주
await win.click('.step:has-text("스타일")');
await win.click('.segmented button:has-text("모든 사진")');
await win.click('.segmented button:has-text("자주")');
await win.click('.step:has-text("사진")');
// 캡션 입력
await win.click('.card-slot >> nth=0');
await win.fill('.inspector input >> nth=0', '1996');
await win.fill('.inspector input >> nth=1', '창립 기념식');
// 음악
await win.click('.step:has-text("음악")');
// 무료 음악 라이브러리 (MF_MUSIC_SITE 가 있으면 온라인 받기까지 검증)
await win.waitForSelector('.lib');
if (process.env.MF_COMMONS_API) {
  // 설치본처럼 음악이 이미 들어 있으면 받기 버튼이 없음
  const fetchBtn = await win.$('.lib button:has-text("인터넷에서 무료 음악")');
  if (fetchBtn) await fetchBtn.click();
  await win.waitForSelector('.lib-row', { timeout: 30000 });
  console.log('library rows:', await win.$$eval('.lib-row', (e) => e.length));
  await win.click('.lib-row >> nth=0 >> button:has-text("넣기")');
  await win.waitForSelector('.lib-used', { timeout: 30000 });
  console.log('library track added:', (await win.textContent('.track-list')).replace(/\s+/g, ' ').slice(0, 80));
}
await win.click('button:has-text("음악 파일 추가")');
await win.waitForSelector(process.env.MF_COMMONS_API ? '.track >> nth=2' : '.track >> nth=1', { timeout: 20000 });
await win.waitForTimeout(800);
if (!big) await win.click('button:has-text("음악 길이에 영상 맞추기")');
await win.waitForTimeout(500);
await win.waitForFunction(() => !document.querySelector('.track-list')?.textContent.includes('박자 분석 중'), null, { timeout: 30000 }).catch(() => {});
console.log('tracks:', (await win.textContent('.track-list')).replace(/\s+/g, ' ').slice(0, 200));
console.log('beat sync:', (await win.textContent('.panel')).match(/장면 전환 \d+곳[^.]*|박자를 찾지[^.]*|박자 분석 중/)?.[0]);
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
await win.waitForSelector('.done-badge, .error-friendly', { timeout: 1700000 });
console.log('export seconds', ((Date.now() - t0) / 1000).toFixed(1));
await win.screenshot({ path: path.join(root, 'out', 'e2e_done.png') });
const err = await win.$('.error-friendly');
if (err) console.log('EXPORT ERROR:', await err.textContent());
if (!big && !err) {
  await win.click('.modal-actions button:has-text("닫기")');
  const t1 = Date.now();
  await win.click('button:has-text("빠른 시안 먼저 만들기")');
  await win.waitForSelector('.done-badge, .error-friendly', { timeout: 900000 });
  console.log('draft seconds', ((Date.now() - t1) / 1000).toFixed(1), (await win.$('.error-friendly')) ? 'ERROR' : 'ok');
  await win.click('.modal-actions button:has-text("닫기")');
  console.log('export panel ETA:', (await win.textContent('.panel')).match(/예상 제작 시간[^)]*\)?/)?.[0]);
}
// 새로 만들기: 저장 확인 → 취소 → 저장 안 함
await win.click('.top-actions button:has-text("새로 만들기")');
await win.waitForSelector('.confirm-modal');
await win.click('.confirm-modal button:has-text("취소")');
console.log('after cancel photos:', await win.$$eval('.card-slot', (e) => e.length));
await win.click('.top-actions button:has-text("새로 만들기")');
await win.click('.confirm-modal button:has-text("저장 안 함")');
await win.waitForSelector('.tpl-modal');
console.log('after new: photos', await win.$$eval('.card-slot', (e) => e.length), 'tracks', await win.evaluate(() => document.querySelectorAll('.track').length));
console.log('page errors:', errors.length ? JSON.stringify(errors).slice(0, 1500) : 'none');
await app.close();
