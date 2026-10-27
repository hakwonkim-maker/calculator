// 자동 사진 선별 단위 테스트: node tests/select-test.mjs
import assert from 'node:assert';
import { planSelection, clearSelection } from '../src/engine/select.js';
import { buildTimeline } from '../src/engine/timeline.js';
import { defaultProject } from '../src/engine/presets.js';

let id = 0;
const mk = (folder, n, year, { burst = 0, q } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: 'p' + id++, type: 'photo', path: `/r/${folder}/a${i}.jpg`,
    date: +new Date(year, 3, 1) + (burst && i % burst ? i * 1000 : i * 3600e3), dateSource: 'exif', w: 4000, h: 3000,
    q: q ? q(i) : 0.6,
  }));
const p = defaultProject();
p.items = [
  ...mk('1996 창립', 6, 1996),
  { id: 'ch', type: 'chapter', title: '2005' },
  ...mk('2005 사옥', 30, 2005, { burst: 3 }),
  { id: 'ch2', type: 'chapter', title: '2019' },
  ...mk('2019 체육대회', 160, 2019, { burst: 3, q: (i) => (i % 3 === 1 ? 0.1 : 0.8) }),
];
p.items[3].star = true;
p.items[60].caption = '우승!';
p.items[61].skip = true; // 이전 선별 흔적은 무시되어야 함

const r = planSelection(p, 180, 3);
const tl = buildTimeline(r.project);
const kept = r.project.items.filter((i) => i.type === 'photo' && !i.skip);
console.log(`180초 @3초 → ${r.count}/${r.total}장, 1장당 ${r.photoDuration.toFixed(2)}초, 실제 길이 ${tl.total.toFixed(1)}초`);
assert(Math.abs(tl.total - 180) < 1, '목표 길이에 맞음');
assert(r.photoDuration >= 3 - 1e-6, '1장당 3초 이상');
assert(kept.some((i) => i.id === 'p3'), '★ 대표 사진 포함');
assert(kept.some((i) => i.id === p.items[60].id), '자막 사진 포함');
const by = (f) => kept.filter((i) => i.path.includes(f)).length;
assert(by('1996') >= 3, '사진이 적은 옛 폴더도 충분히 포함: ' + by('1996'));
assert(by('2019') > by('2005'), '사진 많은 폴더는 더 많이');
// 연사 중 흐린 사진(q=0.1)은 피함
const blurry = kept.filter((i) => i.path.includes('2019') && i.q < 0.2).length;
assert(blurry <= 1, '흐린 사진 거의 제외: ' + blurry);
// 사진이 충분히 적으면 모두 사용
const small = { ...p, items: p.items.slice(0, 5) };
assert.equal(planSelection(small, 180, 3).count, 5, '적으면 전부');
// 해제
assert(!clearSelection(r.project).items.some((i) => i.skip), '선별 해제');
// 빈 챕터 제거 (2005 사진이 모두 빠지면 2005 챕터도 안 나옴)
const only = { ...p, items: p.items.map((i) => (i.path?.includes('2005') ? { ...i, skip: true } : i)) };
const chs = buildTimeline(only).segments.filter((s) => s.type === 'chapter').map((s) => s.item.title);
assert.deepEqual(chs, ['2019'], '빈 챕터 숨김: ' + chs);
console.log('모두 통과');
