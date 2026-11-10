// 타임라인 우클릭 메뉴 + 다른 이름으로 저장 E2E
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { _electron } = require(process.env.PW_PATH || 'playwright');
const root = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync('/tmp/claude-0/mf-menu-');
const saveAs = path.join(tmp, '다른이름.memoria');
const app = await _electron.launch({
  executablePath: process.env.MF_EXE || path.join(root, '..', 'node_modules', 'electron', 'dist', 'electron'),
  args: [...(process.env.MF_EXE ? [] : [path.join(root, '..')]), '--no-sandbox', '--user-data-dir=' + fs.mkdtempSync('/tmp/claude-0/mf-')],
  env: { ...process.env, MF_TEST_NO_PROMPT: '1' },
});
await app.evaluate(
  ({ dialog }, { folder, extra, saveAs }) => {
    dialog.showOpenDialog = async (_w, o) => {
      const props = (o || _w)?.properties || [];
      if (props.includes('openDirectory')) return { canceled: false, filePaths: [folder] };
      return { canceled: false, filePaths: [extra] };
    };
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: saveAs });
  },
  { folder: path.join(root, 'fixtures-mix'), extra: path.join(root, 'fixtures', 'p05_square.jpg'), saveAs },
);
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
const ok = (c, m) => console.log(c ? '✓' : '✗', m);
const names = () => win.$$eval('.card-slot .card', (e) => e.map((x) => x.title));
const badges = () => win.$$eval('.card-slot .card', (e) => e.map((x) => x.querySelector('.card-montage')?.textContent || ''));
const rclick = (n) => win.click(`.card-slot >> nth=${n}`, { button: 'right' });
const menuPick = async (label, sub) => {
  await win.waitForSelector('.timeline-menu');
  if (sub) {
    await win.hover(`.timeline-menu > .tm-item:has-text("${label}")`);
    await win.click(`.tm-sub .tm-item:has-text("${sub}")`);
  } else await win.click(`.timeline-menu .tm-item:has-text("${label}")`);
  await win.waitForTimeout(400);
};

await win.waitForSelector('.tpl-modal');
await win.click('.tpl-grid .pcard >> nth=0');
await win.click('.empty-card .btn-primary');
await win.waitForSelector('.card-slot', { timeout: 15000 }).catch(async () => {
  await win.screenshot({ path: path.join(root, 'out', 'menu_fail.png') });
  console.log('toasts', await win.$$eval('.toast', (e) => e.map((x) => x.textContent).join(' | ')));
});
await win.waitForTimeout(800);
// 자동 몽타주를 꺼서 직접 만든 몽타주만 보이게
await win.click('.step:has-text("스타일")');
await win.click('.segmented button:has-text("끄기") >> nth=0');
const before = await names();

// 1) 2~4번째 사진 선택 → 우클릭 → 몽타주로 만들기 ▸ 폴라로이드
await win.click('.card-slot >> nth=1');
await win.click('.card-slot >> nth=3', { modifiers: ['Shift'] });
await rclick(2);
await win.waitForSelector('.timeline-menu');
await win.screenshot({ path: path.join(root, 'out', 'menu_open.png') });
await menuPick('몽타주로 만들기', '폴라로이드');
let b = await badges();
ok(b.filter((x) => x === '폴라로이드').length === 3, '3장이 폴라로이드 몽타주: ' + b.join('|'));
await win.screenshot({ path: path.join(root, 'out', 'menu_montage.png') });

// 떨어진 사진을 고르면 몽타주 메뉴 비활성
await win.click('.card-slot >> nth=0');
await win.click('.card-slot >> nth=6', { modifiers: ['Control'] });
await rclick(6);
await win.waitForSelector('.timeline-menu');
ok(!!(await win.$('.timeline-menu .tm-item.disabled:has-text("몽타주로 만들기")')), '떨어진 사진은 몽타주 메뉴 비활성');
await win.keyboard.press('Escape');

// 2) 몽타주 해제
await win.click('.card-slot >> nth=2');
await rclick(2);
await menuPick('몽타주 해제');
b = await badges();
ok(!b.some(Boolean), '몽타주 해제');

// 3) 2번째 사진 뒤에 사진 추가 (파일)
await win.click('.card-slot >> nth=1');
await rclick(1);
await menuPick('이 사진 뒤에 사진 추가', '사진 파일 선택');
await win.waitForTimeout(800);
let n = await names();
ok(n[2] === 'p05_square.jpg' && n.length === before.length + 1, '2번째 뒤에 추가: ' + n.slice(0, 4).join(', '));

// 4) 영상에서 빼기 → 다시 넣기
await rclick(2);
await menuPick('영상에서 빼기');
ok(!!(await win.$('.card-slot >> nth=2 >> .card.skipped')), '영상에서 빼기 (흐리게)');
await rclick(2);
await menuPick('영상에 다시 넣기');
ok(!(await win.$('.card-slot >> nth=2 >> .card.skipped')), '다시 넣기');

// 5) 프로젝트에서 삭제
await rclick(2);
await menuPick('프로젝트에서 삭제');
n = await names();
ok(n.length === before.length && !n.includes('p05_square.jpg'), '삭제');

// 6) 앞에 챕터 카드 넣기
await rclick(4);
await menuPick('앞에 챕터 카드 넣기');
ok((await win.$$('.card-slot .card.chapter')).length === 1, '챕터 카드 추가');

// 6-1) 장면 레이아웃 지정 (우클릭 ▸ 원형 포커스) → 속성 창 칩이 선택됨
await win.click('.card-slot >> nth=1');
await rclick(1);
await menuPick('장면 레이아웃', '원형 포커스');
ok(!!(await win.$('.inspector .chip.on:has-text("원형 포커스")')), '장면 레이아웃 지정 → 속성 창 반영');
// 6-2) 연출 스타일 바꾸기 (스타일 단계)
await win.click('.step:has-text("스타일")');
await win.click('.style-card:has-text("다이내믹")');
ok(!!(await win.$('.style-card.on:has-text("다이내믹")')), '연출 스타일 선택');
await win.screenshot({ path: path.join(root, 'out', 'menu_direction.png') });

// 7) 다른 이름으로 저장 → 이후 Ctrl+S는 새 파일에
await win.click('.top-actions button[title^="다른 이름으로 저장"]');
await win.waitForTimeout(800);
ok(fs.existsSync(saveAs), '다른 이름으로 저장 파일 생성');
const t = await win.$$eval('.toast', (e) => e.map((x) => x.textContent).join(' | '));
ok(t.includes('다른이름.memoria'), '저장 알림에 새 파일 이름');
const m1 = fs.statSync(saveAs).mtimeMs;
await win.fill('.project-name', '이후 저장');
await win.keyboard.press('Control+s');
await win.waitForTimeout(800);
ok(fs.statSync(saveAs).mtimeMs > m1 && JSON.parse(fs.readFileSync(saveAs, 'utf8')).project.name === '이후 저장', '이후 Ctrl+S는 새 파일에 저장');
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await app.close();
