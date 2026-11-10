// 타임라인 우클릭 편집 단위 테스트: node tests/edit-test.mjs
import assert from 'node:assert';
import { checkMontageSelection, splitEven, makeManualMontage, releaseMontages } from '../src/engine/edit.js';
import { buildTimeline } from '../src/engine/timeline.js';
import { defaultProject } from '../src/engine/presets.js';

const p = defaultProject();
p.items = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, type: 'photo', path: '/r/a' + i + '.jpg' }));
p.items.splice(15, 0, { id: 'c1', type: 'chapter', title: '2005' });
const ids = (...n) => n.map((k) => 'p' + k);

assert.equal(checkMontageSelection(p.items, ids(3)).ok, false, '1장은 불가');
assert.equal(checkMontageSelection(p.items, ids(3, 5)).ok, false, '떨어진 사진 불가');
assert.match(checkMontageSelection(p.items, ids(13, 14, 15)).reason, /챕터/, '챕터가 사이에 있으면 불가');
assert.match(checkMontageSelection(p.items, ['c1', 'p16']).reason, /챕터 카드/, '챕터 선택 불가');
// 사이에 '뺀 사진'은 괜찮음
const q = { ...p, items: p.items.map((it) => (it.id === 'p4' ? { ...it, skip: true } : it)) };
assert.equal(checkMontageSelection(q.items, ids(3, 5)).ok, true, '사이의 뺀 사진은 허용');
assert.deepEqual(splitEven(9), [5, 4]);
assert.deepEqual(splitEven(17), [6, 6, 5]);
assert.deepEqual(splitEven(8), [8]);

// 만들기 → 타임라인에 직접 몽타주 장면
const r = makeManualMontage(p, ids(2, 3, 4), 'polaroid');
assert(!r.error && r.groups === 1 && r.count === 3);
let tl = buildTimeline(r.project);
const g = tl.byItem.get('p2');
assert.equal(g.type, 'group');
assert(g.manual && g.style === 'polaroid' && g.items.length === 3, '직접 몽타주(폴라로이드 3장)');
// 9장 → 두 몽타주로 고르게
const r9 = makeManualMontage(p, ids(16, 17, 18, 19, 20, 21, 22, 23, 24), 'auto');
assert.equal(r9.groups, 2);
tl = buildTimeline(r9.project);
assert.notEqual(tl.byItem.get('p16'), tl.byItem.get('p24'));
assert.equal(tl.byItem.get('p16').items.length + tl.byItem.get('p24').items.length, 9);
// 자막 있는 사진 경고 수
const pc = { ...p, items: p.items.map((it) => (it.id === 'p3' ? { ...it, caption: '창립식' } : it)) };
assert.equal(makeManualMontage(pc, ids(2, 3), 'auto').captioned, 1);
// 직접 몽타주 풀기
const rel = releaseMontages(r.project, buildTimeline(r.project), ['p3']);
assert.equal(rel.released, 1);
assert(!rel.project.items.some((it) => it.mg), 'mg 제거');
assert.notEqual(buildTimeline(rel.project).byItem.get('p2').type, 'group');
// 자동 몽타주 풀기 → 첫 사진 montage:'off'
const auto = buildTimeline(p);
const ag = auto.segments.find((s) => s.type === 'group' && !s.manual);
const rel2 = releaseMontages(p, auto, [ag.items[1].id]);
assert.equal(rel2.project.items.find((i) => i.id === ag.items[0].id).montage, 'off');
// 직접 몽타주 중 한 장을 영상에서 빼면 남은 장으로, 1장만 남으면 일반 사진
const one = { ...r.project, items: r.project.items.map((it) => (it.id === 'p3' || it.id === 'p4' ? { ...it, skip: true } : it)) };
assert.notEqual(buildTimeline(one).byItem.get('p2').type, 'group', '1장만 남으면 일반 사진');
console.log('모두 통과');
