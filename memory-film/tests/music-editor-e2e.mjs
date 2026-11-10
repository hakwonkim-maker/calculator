// 음악 편집 창 E2E: 곡 추가 → 편집 창 → 자르기·나누기·레이어 이동(교차 페이드)·소리 끄기·삭제·채우기 → 저장 → 영상 내보내기(소리 확인)
// 사용법: xvfb-run -a node tests/music-editor-e2e.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync('/tmp/claude-0/mf-mused-');
const saveTo = path.join(tmp, '음악편집.memoria');
const outMp4 = path.join(tmp, '음악편집.mp4');
const app = await _electron.launch({
  executablePath: process.env.MF_EXE || path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'),
  args: [...(process.env.MF_EXE ? [] : [path.join(root, '..')]), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')],
  env: { ...process.env, MF_TEST_NO_PROMPT: '1', MF_MUSIC_DIR: fs.mkdtempSync('/tmp/claude-0/mf-music-'), NO_PROXY: '127.0.0.1,localhost' },
});
await app.evaluate(
  ({ dialog }, { folder, music, saveTo, outMp4 }) => {
    dialog.showOpenDialog = async (_w, o) => {
      const opt = o || _w;
      if ((opt?.properties || []).includes('openDirectory')) return { canceled: false, filePaths: [folder] };
      if ((opt?.filters || []).some((f) => f.name === '오디오')) return { canceled: false, filePaths: music };
      return { canceled: true, filePaths: [] };
    };
    dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: String((o || _w)?.defaultPath || '').endsWith('.mp4') || (o || _w)?.filters?.[0]?.extensions?.includes('mp4') ? outMp4 : saveTo });
  },
  { folder: path.join(root, 'fixtures-mix'), music: [path.join(root, 'fixtures', 'music_a.mp3'), path.join(root, 'fixtures', 'music_b.mp3')], saveTo, outMp4 },
);
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
let fails = 0;
const ok = (c, m) => {
  if (!c) fails++;
  console.log(c ? '✓' : '✗', m);
};
const clips = () => win.$$eval('.me-clip', (e) => e.map((x) => ({ x: x.getBoundingClientRect().x, y: x.getBoundingClientRect().y, w: x.getBoundingClientRect().width, cls: x.className })));
const mode = () => win.textContent('.me-mode');
const shot = (n) => win.screenshot({ path: path.join(root, 'out', `mused_${n}.png`) });

await win.waitForSelector('.tpl-modal');
await win.click('.tpl-grid .pcard >> nth=0');
await win.click('.empty-card .btn-primary');
await win.waitForSelector('.card-slot', { timeout: 20000 });
const photos0 = (await win.$$('.card-slot')).length;
await win.click('.step:has-text("음악")');
await win.click('.panel button:has-text("내 음악 파일 추가")');
await win.waitForFunction(() => document.querySelectorAll('.track').length === 2, null, { timeout: 15000 });

// 1) 편집 창 열기: 자동 배치가 조각으로 보임
await win.click('.strip-bar button:has-text("음악 편집")');
await win.waitForSelector('.music-editor');
await win.waitForTimeout(600);
let cs = await clips();
ok(cs.length >= 3 && cs.every((c) => c.cls.includes('auto')), `자동 배치 조각 ${cs.length}개 (반복 포함)`);
ok((await mode()).includes('자동'), '모드: 자동 배치');
ok((await win.$$('.me-scene')).length > 5, '영상 장면 띠');
await shot('1_auto');

// 2) 첫 조각 뒤쪽 자르기 → 직접 편집으로 바뀜
const c0 = cs[0];
const trimR = await win.$('.me-clip >> nth=0 >> .me-trim.r');
const tb = await trimR.boundingBox();
await win.mouse.move(tb.x + 3, tb.y + 20);
await win.mouse.down();
await win.mouse.move(tb.x - 40, tb.y + 20, { steps: 6 });
await win.mouse.up();
await win.waitForTimeout(300);
cs = await clips();
ok((await mode()).includes('직접'), '자르면 직접 편집으로');
ok(cs[0].w < c0.w - 30, `첫 조각이 짧아짐 ${c0.w.toFixed(0)}→${cs[0].w.toFixed(0)}px`);

// 3) 재생 위치를 첫 조각 가운데로 옮기고 S → 나누기
const n3 = cs.length;
const rb = await (await win.$('.me-ruler')).boundingBox();
await win.mouse.click(cs[0].x + cs[0].w / 2, rb.y + 10);
await win.keyboard.press('s');
await win.waitForTimeout(300);
cs = await clips();
ok(cs.length === n3 + 1, `S 로 나누기 ${n3}→${cs.length}`);

// 4) 나눈 뒤쪽 조각을 레이어 3으로 끌어 앞 조각과 겹치게 → 교차 페이드
const second = cs[1];
await win.mouse.move(second.x + second.w / 2, second.y + 30);
await win.mouse.down();
await win.mouse.move(second.x + second.w / 2 - 25, second.y + 30 + 62 * 2, { steps: 8 });
await win.mouse.up();
await win.waitForTimeout(300);
const layerCount = (await win.$$('.me-head-lane')).length;
ok(layerCount >= 3, '레이어 3 생성: ' + layerCount);
const fadeIn = Number(await win.inputValue('.me-form label:has-text("페이드인") input'));
ok(fadeIn > 0.3, '겹친 만큼 자동 교차 페이드: ' + fadeIn + '초');
await shot('2_cross');

// 5) 숫자로 페이드아웃 조절
await win.fill('.me-form label:has-text("페이드아웃") input', '1.5');
await win.waitForTimeout(200);
ok(Number(await win.inputValue('.me-form label:has-text("페이드아웃") input')) === 1.5, '페이드아웃 숫자 입력');

// 6) 레이어 소리 끄기 / 다시 켜기
await win.click('.me-head-lane >> nth=2 >> button[title*="소리 끄기"]');
await win.waitForTimeout(200);
ok((await win.$$('.me-clip.muted')).length >= 1, '레이어 소리 끄기');
await win.click('.me-head-lane >> nth=2 >> button[title*="소리 켜기"]');

// 7) Delete 는 고른 음악 조각만 지움 (사진은 그대로)
cs = await clips();
await win.mouse.click(cs[cs.length - 1].x + 10, cs[cs.length - 1].y + 30);
await win.keyboard.press('Delete');
await win.waitForTimeout(300);
ok((await clips()).length === cs.length - 1, 'Delete → 조각 삭제');
// 8) 영상 길이 채우기 → 비는 구간 없음
await win.click('.me-toolbar button:has-text("영상 길이 채우기")');
await win.waitForTimeout(400);
const gaps = (await win.$$('.me-gap')).length;
ok(gaps <= 1, '채우기 후 비는 구간 ' + gaps + '곳 (앞쪽 자른 자리 외 없음)');
await shot('3_filled');

// 9) Ctrl+Z 로 되돌리기 → 채우기 취소
const before = (await clips()).length;
await win.keyboard.press('Control+z');
await win.waitForTimeout(300);
ok((await clips()).length !== before, '되돌리기 (Ctrl+Z)');
await win.keyboard.press('Control+y');
await win.waitForTimeout(300);
ok((await clips()).length === before, '다시 실행');

// 8-1) 페이드인·아웃이 맞닿은 조각이 있어도 재생이 멈추지 않음 (미리보기 소리 예약)
cs = await clips();
await win.mouse.click(cs[0].x + 12, cs[0].y + 30);
await win.fill('.me-form label:has-text("페이드인") input', '99');
await win.fill('.me-form label:has-text("페이드아웃") input', '99');
await win.waitForTimeout(200);
const fi2 = Number(await win.inputValue('.me-form label:has-text("페이드인") input'));
const fo2 = Number(await win.inputValue('.me-form label:has-text("페이드아웃") input'));
ok(fi2 > 0 && fo2 >= 0, `페이드가 조각 길이에 맞춰짐 (${fi2}+${fo2})`);
const rb2 = await (await win.$('.me-ruler')).boundingBox();
await win.mouse.click(rb2.x + 5, rb2.y + 10);
// Space 두 번: 재생 중이었으면 멈췄다 다시, 멈춰 있었으면 재생했다 멈춤 → 둘 중 한 구간은 시간이 흐름
const sec = (x) => x.split(':').reduce((m, v) => m * 60 + Number(v), 0);
const tA = sec(await win.textContent('.me-time'));
await win.keyboard.press('Space');
await win.waitForTimeout(1500);
const tB = sec(await win.textContent('.me-time'));
await win.keyboard.press('Space');
await win.waitForTimeout(1500);
const tC = sec(await win.textContent('.me-time'));
ok(Math.max(tB - tA, tC - tB) > 0.8 && !errors.length, `Space 로 재생 ${tA}→${tB}→${tC}초, 오류 없음`);
if (tC - tB > 0.8) await win.keyboard.press('Space');

// 10) 닫기 → 사진 필름스트립 그대로, 음악 단계에 '직접 편집 중'
await win.keyboard.press('Escape');
await win.keyboard.press('Escape');
await win.waitForSelector('.music-editor', { state: 'detached' });
ok((await win.$$('.card-slot')).length === photos0, '사진은 그대로 ' + photos0 + '장');
ok((await win.textContent('.panel')).includes('직접 편집 중'), '음악 단계에 직접 편집 표시');

// 11) 저장 → 파일에 조각 저장
await win.keyboard.press('Control+s');
await win.waitForTimeout(800);
const saved = JSON.parse(fs.readFileSync(saveTo, 'utf8'));
ok(saved.project.music.mode === 'edit' && saved.project.music.clips.length >= 3, `저장 파일: 직접 편집 조각 ${saved.project.music.clips.length}개`);

// 12) 영상 내보내기 → 소리 길이 = 영상 길이, 소리 있음
await win.click('.step:has-text("내보내기")');
await win.click('.panel .btn-primary:has-text("영상 파일 만들기")');
await win.waitForSelector('.done-badge, .error-friendly', { timeout: 900000 });
ok(!(await win.$('.error-friendly')), '내보내기 완료');
if (fs.existsSync(outMp4)) {
  const ff = require('ffmpeg-static');
  const pr = spawnSync(ff, ['-i', outMp4, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const mean = Number((pr.stderr.match(/mean_volume: (-?[\d.]+)/) || [])[1]);
  const vd = (pr.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/) || []).slice(1).map(Number);
  ok(Number.isFinite(mean) && mean > -40, '영상에 음악 소리 있음 (평균 ' + mean + ' dB)');
  const sil = spawnSync(ff, ['-i', outMp4, '-map', '0:a', '-af', 'silencedetect=n=-45dB:d=2', '-f', 'null', '-'], { encoding: 'utf8' });
  const silences = (sil.stderr.match(/silence_start/g) || []).length;
  ok(silences <= 1, '긴 무음 구간 ' + silences + '곳 (영상 끝 페이드 외)');
  console.log('길이', vd);
} else ok(false, 'mp4 파일 없음');
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await app.close();
process.exit(fails ? 1 : 0);
