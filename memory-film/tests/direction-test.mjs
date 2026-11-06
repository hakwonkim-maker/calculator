// 연출 스타일·장면 레이아웃·새 몽타주·새 템플릿 단위 테스트: node tests/direction-test.mjs
import assert from 'node:assert';
import { buildTimeline, planMontage, accentAt, photoText, manualStyleFor } from '../src/engine/timeline.js';
import { makeManualMontage } from '../src/engine/edit.js';
import { defaultProject, normalizeProject, applyTemplate, TEMPLATES, DIRECTIONS, LAYOUTS, MONTAGE_STYLES, MONTAGE_CLASSIC_ORDER } from '../src/engine/presets.js';

const mk = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, type: 'photo', path: '/r/a' + i + '.jpg', ...extra(i) }));
const proj = (direction, items, style = {}) => ({ ...defaultProject(), items, style: { ...defaultProject().style, direction, ...style } });
const photoSegs = (tl) => tl.segments.filter((s) => s.type === 'photo');

// 1) 예전 프로젝트(연출 스타일 없음) → '심플': 레이아웃은 모두 '꽉 차게', 자동 몽타주는 예전 네 가지만
{
  const old = normalizeProject({ ...defaultProject(), style: { ...defaultProject().style, direction: undefined }, items: mk(120) });
  delete old.style.direction;
  const n = normalizeProject({ style: { theme: 'noir' }, items: mk(120) });
  assert.equal(n.style.direction, 'simple', '예전 파일은 심플');
  assert.equal(normalizeProject(defaultProject()).style.direction, 'classic', '새 프로젝트는 클래식');
  assert.equal(normalizeProject({ style: { direction: 'zzz' } }).style.direction, 'classic', '모르는 값은 클래식');
  const tl = buildTimeline(n);
  assert(photoSegs(tl).every((s) => s.layout === 'full'), '심플은 꽉 차게만');
  const styles = new Set(tl.segments.filter((s) => s.type === 'group').map((s) => s.style));
  assert(styles.size > 0 && [...styles].every((s) => MONTAGE_CLASSIC_ORDER.includes(s)), '심플 몽타주는 예전 4종: ' + [...styles]);
  // 예전 계획과 똑같은지: 예전 순서로 직접 계산한 것과 비교 (무작위 소비 동일)
  const a = planMontage(n.items, { ...n.style, direction: 'simple' }).map((g) => g.style || g.type).join(',');
  const b = planMontage(n.items, { ...n.style, direction: undefined }).map((g) => g.style || g.type).join(',');
  assert.equal(a, b, '심플 = 예전 구성');
}

// 1-1) 예전(v1.7) 직접 몽타주의 '자동' 효과가 그대로 (심플)
{
  const OLD = (n) => (n <= 3 ? ['split', 'filmstrip'] : n <= 5 ? ['grid', 'polaroid', 'split'] : ['grid', 'filmstrip', 'polaroid']);
  for (let n = 2; n <= 8; n++) for (let k = 0; k < 40; k++) {
    const id = 'mg' + k;
    const o = OLD(n);
    assert.equal(manualStyleFor(n, id, undefined, 'simple'), manualStyleFor(n, id, undefined, undefined));
    assert(o.includes(manualStyleFor(n, id, undefined, 'simple')), `예전 후보 ${n}`);
  }
  const items = mk(12, (i) => (i >= 2 && i < 5 ? { mg: 'mgA' } : {}));
  const n = normalizeProject({ style: { theme: 'noir', montage: 'off' }, items });
  assert(['split', 'filmstrip'].includes(buildTimeline(n).byItem.get('p2').style), '예전 파일의 직접 몽타주(자동) 효과 유지');
}

// 2) 연출 스타일별 레이아웃 규칙
const withText = (i) => (i % 9 === 0 ? { caption: '자막 ' + i } : { folder: i < 100 ? '2010 체육대회' : '' });
for (const d of Object.keys(DIRECTIONS)) {
  const items = mk(200, withText);
  items.splice(50, 0, { id: 'c1', type: 'chapter', title: '2005' });
  const p = proj(d, items, { montage: 'normal' });
  const tl = buildTimeline(p);
  const ps = photoSegs(tl);
  const counts = {};
  for (const s of ps) counts[s.layout] = (counts[s.layout] || 0) + 1;
  for (const k of Object.keys(counts)) assert(LAYOUTS[k], `${d}: 알 수 없는 레이아웃 ${k}`);
  for (const k of Object.keys(counts)) if (k !== 'full') assert(DIRECTIONS[d].layouts[k], `${d}: 스타일에 없는 레이아웃 ${k}`);
  // 특별한 레이아웃이 연달아 나오지 않음 (매거진은 다른 종류끼리 허용)
  const segs = tl.segments;
  for (let i = 1; i < segs.length; i++) {
    const A = segs[i - 1];
    const B = segs[i];
    if (A.type !== 'photo' || B.type !== 'photo' || A.layout === 'full' || B.layout === 'full') continue;
    assert(d === 'magazine' && A.layout !== B.layout, `${d}: 연속 ${A.layout}→${B.layout}`);
  }
  // 매거진 레이아웃은 글자 있는 사진에만
  for (const s of ps) if (s.layout === 'editorial') assert(photoText(s.item).any, `${d}: 글자 없는 사진에 매거진`);
  // 임팩트 줌은 컷으로 들어옴
  for (const s of ps) if (s.layout === 'punch') assert.equal(s.transIn, 'none', '임팩트 줌은 컷');
  // 결정적
  assert.equal(buildTimeline(p).segments.map((s) => s.layout || '-').join(), segs.map((s) => s.layout || '-').join(), '같은 결과');
  const nonFull = ps.filter((s) => s.layout !== 'full').length / ps.length;
  if (d === 'simple') assert.equal(nonFull, 0);
  else assert(nonFull > 0.08 && nonFull < 0.5, `${d}: 특별 레이아웃 비율 ${nonFull.toFixed(2)}`);
  // 몽타주 효과는 스타일의 묶음 안에서
  const gs = tl.segments.filter((s) => s.type === 'group');
  for (const g of gs) assert(DIRECTIONS[d].montages.includes(g.style), `${d}: 묶음 밖 몽타주 ${g.style}`);
  if (d !== 'simple') assert(new Set(gs.map((g) => g.style)).size >= 3, `${d}: 몽타주가 고르게 돌아가야 함`);
  console.log(`✓ ${d.padEnd(9)} 레이아웃 ${JSON.stringify(counts)} · 몽타주 ${[...new Set(gs.map((g) => g.style))].join('/')}`);
}

// 다이내믹: 챕터 뒤 첫 사진은 임팩트 줌
{
  const items = mk(40);
  items.splice(10, 0, { id: 'c1', type: 'chapter', title: '2005' });
  const tl = buildTimeline(proj('dynamic', items, { montage: 'off' }));
  const k = tl.segments.findIndex((s) => s.type === 'chapter');
  assert.equal(tl.segments[k + 1].layout, 'punch', '챕터 뒤 임팩트 줌');
}
// 인트로 바로 뒤에는 임팩트 줌 없음 (인트로 전환에 가려짐)
for (let seed = 1; seed < 40; seed++) {
  const tl = buildTimeline(proj('dynamic', mk(20), { montage: 'off', seed }));
  const k = tl.segments.findIndex((s) => s.type === 'intro');
  assert.notEqual(tl.segments[k + 1].layout, 'punch');
}
// 짧은 사진(1초)은 꽉 차게·임팩트 줌만
{
  const tl = buildTimeline(proj('magazine', mk(80, withText), { photoDuration: 1.2, transitionDuration: 0.5, montage: 'off' }));
  assert(photoSegs(tl).every((s) => s.layout === 'full' || s.layout === 'punch'), '짧은 사진 레이아웃 제한');
}
// 사진별 지정(item.layout)이 우선
{
  const items = mk(10, (i) => (i === 3 ? { layout: 'circle' } : i === 4 ? { layout: 'cinema' } : {}));
  const tl = buildTimeline(proj('simple', items, { montage: 'off' }));
  assert.equal(tl.byItem.get('p3').layout, 'circle');
  assert.equal(tl.byItem.get('p4').layout, 'cinema', '연달아 지정해도 사용자가 고른 대로');
}

// 3) 새 몽타주: 직접 만든 몽타주로 2~8장 모두 장면이 됨
for (const st of Object.keys(MONTAGE_STYLES)) {
  for (let n = 2; n <= 8; n++) {
    const items = mk(n + 4, (i) => (i >= 2 && i < 2 + n ? { mg: 'm1', mgStyle: st } : {}));
    const tl = buildTimeline(proj('classic', items, { montage: 'off' }));
    const g = tl.byItem.get('p2');
    assert(g.type === 'group' && g.style === st && g.items.length === n, `${st} ${n}장`);
    assert(g.dur > 3 && g.dur < 12, `${st} 길이 ${g.dur}`);
  }
}
console.log('✓ 몽타주 10종 × 2~8장');

// 4) 템플릿: 15종, 숏폼은 세로 화면 → 다른 템플릿으로 바꾸면 되돌아감
assert.equal(Object.keys(TEMPLATES).length, 15);
for (const [id, t] of Object.entries(TEMPLATES)) assert(DIRECTIONS[t.style.direction], `${id}: 연출 스타일`);
{
  let p = applyTemplate(defaultProject(), 'shorts');
  assert.equal(p.output.aspect, '9:16');
  assert.equal(p.style.photoDuration, 2.2);
  p = applyTemplate(p, 'wedding');
  assert.equal(p.output.aspect, '16:9', '숏폼 → 웨딩: 가로로 복귀');
  assert.equal(p.style.photoDuration, defaultProject().style.photoDuration);
  assert.equal(p.style.direction, 'emotional');
  // 사용자가 직접 바꾼 화면비는 숏폼이 아닌 템플릿끼리 바꿀 때 유지
  p = applyTemplate({ ...defaultProject(), output: { ...defaultProject().output, aspect: '1:1' } }, 'event');
  p = applyTemplate(p, 'travel');
  assert.equal(p.output.aspect, '1:1');
}

// 5) 박자 강조: 다이내믹 + 박자 있는 음악일 때만, 센 박자 직후 잠깐
{
  const beats = Array.from({ length: 200 }, (_, i) => i * 0.5);
  const strength = beats.map((_, i) => (i % 4 === 0 ? 1 : 0.3));
  const music = { ...defaultProject().music, tracks: [{ path: 'a.mp3', duration: 100, beats, beatStrength: strength, bpm: 120 }] };
  const tl = buildTimeline({ ...proj('dynamic', mk(30)), music });
  assert(tl.accents?.length > 10, '강조 박자');
  assert(tl.accents.every((t, i) => !i || t - tl.accents[i - 1] >= 0.9), '최소 간격');
  const t0 = tl.accents[3];
  assert(accentAt(tl, t0 + 0.05) > 0.8 && accentAt(tl, t0 + 0.5) === 0 && accentAt(tl, t0 - 0.01) === 0);
  const tl2 = buildTimeline({ ...proj('classic', mk(30)), music });
  assert(!tl2.accents, '클래식은 박자 강조 없음');
  assert.equal(accentAt(tl2, 5), 0);
}
// 6) 기존 설정과의 연동
{
  // 폴더 이름: '폴더 이름 표시'를 껐으면 새 장면·몽타주에도 쓰지 않음, 카메라 기본 폴더 이름은 항상 제외
  const it = { id: 'x', type: 'photo', path: 'D:/사진/2019_체육대회/a.jpg' };
  assert.equal(photoText(it, { folderLabel: 'off' }).folder, '');
  assert.equal(photoText(it, { folderLabel: 'change' }).folder, '2019 체육대회');
  assert.equal(photoText(it, { folderLabel: 'change' }).big, '2019', '폴더 속 연도가 큰 글자');
  for (const f of ['DCIM', '100CANON', 'Camera', 'KakaoTalk', '다운로드', '새 폴더', 'Screenshots']) assert.equal(photoText({ ...it, path: `D:/${f}/a.jpg` }, { folderLabel: 'all' }).folder, '', f);
  // 매거진 레이아웃은 폴더 표시를 끈 프로젝트에서 폴더 이름만 있는 사진에 쓰이지 않음
  const items = mk(120, () => ({ folder: '2010 체육대회' }));
  const off = photoSegs(buildTimeline(proj('magazine', items, { montage: 'off', folderLabel: 'off' })));
  assert(!off.some((s) => s.layout === 'editorial'), '폴더 끔 → 매거진 없음');
  const on = photoSegs(buildTimeline(proj('magazine', items, { montage: 'off', folderLabel: 'change' })));
  assert(on.some((s) => s.layout === 'editorial'), '폴더 켬 → 매거진 있음');
  // 사진별 '화면 맞춤: 전체' → 잘리는 레이아웃 없음
  for (const d of ['cinematic', 'magazine', 'emotional', 'dynamic']) {
    const ps = photoSegs(buildTimeline(proj(d, mk(150, (i) => ({ fit: 'contain', caption: i % 2 ? '자막' : '' })), { montage: 'off' })));
    assert(!ps.some((s) => ['cinema', 'circle', 'editorial'].includes(s.layout)), d + ': 전체 보기 사진이 잘림');
  }
  // 가로 화면의 세로 사진은 시네마 제외 (세로 화면은 반대)
  const tall = photoSegs(buildTimeline(proj('cinematic', mk(150, () => ({ w: 3000, h: 4000 })), { montage: 'off' })));
  assert(!tall.some((s) => s.layout === 'cinema'), '세로 사진 시네마 제외');
  const tallV = photoSegs(buildTimeline({ ...proj('cinematic', mk(150, () => ({ w: 3000, h: 4000 })), { montage: 'off' }), output: { ...defaultProject().output, aspect: '9:16' } }));
  assert(tallV.some((s) => s.layout === 'cinema'), '세로 화면에서는 세로 사진 시네마 허용');
  // 카메라 움직임 '없음' → 임팩트 줌·박자 펄스 없음
  const still = photoSegs(buildTimeline(proj('dynamic', mk(150), { montage: 'off', motion: 'none' })));
  assert(!still.some((s) => s.layout === 'punch'), '움직임 없음 → 임팩트 줌 없음');
  const one = photoSegs(buildTimeline(proj('dynamic', mk(150, () => ({ motion: 'none' })), { montage: 'off' })));
  assert(!one.some((s) => s.layout === 'punch'), '사진별 고정 → 임팩트 줌 없음');
  // 흑백 색감 → 흑백→컬러 없음
  const mono = photoSegs(buildTimeline(proj('emotional', mk(150), { montage: 'off', look: 'mono' })));
  assert(!mono.some((s) => s.layout === 'reveal'), '흑백 색감 → 흑백→컬러 없음');
  // 직접 몽타주로 묶으면 사진별 레이아웃 지정이 정리됨
  const lp = proj('classic', mk(8, (i) => (i < 3 ? { layout: 'circle' } : {})));
  const r = makeManualMontage(lp, ['p0', 'p1', 'p2'], 'auto');
  assert(r.project.items.slice(0, 3).every((i) => !i.layout && i.mg), '몽타주로 묶으면 레이아웃 정리');
}
{
  const beats = Array.from({ length: 200 }, (_, i) => i * 0.5);
  const music = { ...defaultProject().music, tracks: [{ path: 'a.mp3', duration: 100, beats, beatStrength: beats.map((_, i) => (i % 4 ? 0.3 : 1)), bpm: 120 }] };
  assert(!buildTimeline({ ...proj('dynamic', mk(30), { motion: 'none' }), music }).accents, '움직임 없음 → 박자 펄스 없음');
}
console.log('✓ 기존 설정 연동 (폴더 표시·화면 맞춤·사진 방향·카메라 움직임·흑백·직접 몽타주)');
console.log('direction-test: 모두 통과');
