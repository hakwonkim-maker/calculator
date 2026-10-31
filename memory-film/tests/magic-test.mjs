// 매직 버튼 자동 연출 단위 테스트: node tests/magic-test.mjs
import assert from 'node:assert';
import { magicProject, magicLength } from '../src/engine/magic.js';
import { defaultProject } from '../src/engine/presets.js';

let id = 0;
const mk = (folder, n, year) => Array.from({ length: n }, (_, i) => ({ id: 'p' + id++, type: 'photo', path: `/r/${folder}/a${i}.jpg`, name: `a${i}.jpg`, date: +new Date(year, 3, 1 + i), dateSource: 'exif', w: 4000, h: 3000, q: (i * 37) % 100 / 100 }));
const base = defaultProject();
// 폴더가 뒤섞인 순서로 들어옴
base.items = [...mk('2019 체육대회', 120, 2019), ...mk('1996 창립', 8, 1996), ...mk('2005 사옥', 30, 2005), ...mk('2024 송년회', 20, 2024)];
const track = { path: 'x.m4a', name: '캐논', duration: 200, beats: [] };

// 1) 새 폴더 + 음악 200초
{
  const { project, info } = magicProject(base, { intro: 'timeroll', track, fresh: true, seed: 7 });
  const photos = project.items.filter((i) => i.type === 'photo');
  const chapters = project.items.filter((i) => i.type === 'chapter').map((c) => c.title);
  console.log('새 폴더:', info, chapters.join(','));
  assert.deepEqual(chapters, ['1996', '2005', '2019', '2024'], '연도 챕터 + 촬영일순');
  assert.equal(project.intro.style, 'timeroll');
  assert(Math.abs(info.total - 200) < 1.5, '음악 길이에 맞춤');
  assert(info.used < info.all, '사진이 많으면 자동 선별');
  assert(photos.filter((p) => p.star).length === 5, '대표 사진 5장 지정');
  assert.equal(project.style.folderLabel, 'change', '폴더가 여러 개면 폴더명 표시');
  assert(project.style.beatSync && project.style.montage === 'normal');
}
// 2) 기존 프로젝트 다시 만들기: 사용자가 뺀 사진·자막·순서 유지
{
  const p = { ...base, items: base.items.map((it, k) => (k === 3 ? { ...it, caption: '우승!' } : k === 5 ? { ...it, skip: true } : it)) };
  const { project, info } = magicProject(p, { intro: 'flashcut', track: null, fresh: false, seed: 3 });
  const ids = project.items.filter((i) => i.type === 'photo').map((i) => i.id);
  console.log('다시 만들기:', info);
  assert.deepEqual(ids, p.items.map((i) => i.id), '순서 유지 (정렬 안 함)');
  assert(project.items.find((i) => i.id === p.items[5].id).skip, '사용자가 뺀 사진은 계속 제외');
  assert(!project.items.find((i) => i.id === p.items[3].id).skip, '자막 사진은 유지');
  assert.equal(project.items.filter((i) => i.type === 'chapter').length, 0, '기존 프로젝트엔 챕터 추가 안 함');
  assert.equal(info.target, 180, '음악 없으면 3분');
}
// 3) 사진이 적을 때: 자연스러운 길이, 선별 없음
{
  const p = { ...base, items: base.items.slice(0, 12) };
  const { info } = magicProject(p, { intro: 'golden', track, fresh: true, seed: 1 });
  console.log('사진 적음:', info);
  assert.equal(info.used, 12);
  assert(info.total < 80, '1장당 약 3초');
}
assert.deepEqual(magicLength(50, 0).select, false);
// 곡이 짧으면(70초) 사진이 많아도 1분짜리로 줄이지 않고 3분 + 음악 반복
assert.deepEqual(magicLength(178, 70), { target: 180, select: true }, '짧은 곡: 사진 기준 3분');
assert.equal(magicLength(178, 240).target, 240, '어울리는 곡: 곡 길이에 맞춤');
assert.equal(magicLength(178, 600).target, 360, '긴 곡: 최대 6분');
console.log('모두 통과');
