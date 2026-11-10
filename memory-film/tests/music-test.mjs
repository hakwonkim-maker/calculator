// 음악 직접 편집 단위 테스트: node tests/music-test.mjs
import assert from 'node:assert';
import {
  autoClips, toEdit, toAuto, moveClip, trimClip, splitClip, placeClip, appendTrack, fillToEnd, deleteClips, setFade,
  removeTrackClips, setRange, addLayer, removeLayer, toggleMute, snapTime, editBeats, activeClips, musicEnd, silentGaps, usedPaths, clipGain, clipEnd,
} from '../src/engine/musicedit.js';
import { beatsOnTimeline } from '../src/engine/beats.js';
import { buildTimeline } from '../src/engine/timeline.js';
import { defaultProject, normalizeProject } from '../src/engine/presets.js';
import { musicLength, checklist } from '../src/ui/logic.js';

const near = (a, b, e = 1e-3) => Math.abs(a - b) < e;
const A = { path: '/m/a.mp3', name: 'A', duration: 60, beats: Array.from({ length: 120 }, (_, i) => i * 0.5), beatStrength: Array.from({ length: 120 }, (_, i) => (i % 4 ? 0.3 : 1)) };
const B = { path: '/m/b.mp3', name: 'B', duration: 40, beats: Array.from({ length: 80 }, (_, i) => 0.25 + i * 0.5), beatStrength: Array.from({ length: 80 }, () => 0.6) };
const base = { ...defaultProject().music, tracks: [A, B], crossfade: 3, fadeIn: 1.5, loop: true };

// 1) 자동 배치 → 조각: 예전 규칙(곡 순서, crossfade 겹침, 반복)
{
  const c = autoClips(base, 200);
  assert.equal(c[0].path, A.path);
  assert.equal(c[0].fadeIn, 1.5, '첫 곡 페이드인');
  assert(near(c[1].start, 57) && c[1].fadeIn === 3 && c[0].fadeOut === 3, 'A→B 3초 교차');
  assert.equal(c[2].path, A.path, '반복');
  assert(c.every((x, i) => x.layer === i % 2), '레이어 번갈아');
  assert(clipEnd(c[c.length - 1]) >= 200, '영상 끝까지');
  const noLoop = autoClips({ ...base, loop: false }, 200);
  assert.equal(noLoop.length, 2);
  assert.equal(noLoop[1].fadeOut, 0, '마지막 곡은 페이드아웃 없음(전체 페이드가 처리)');
  // 자동 모드의 음악 길이 = 예전 계산과 같음
  assert(near(musicEnd({ ...base, loop: false }), 97));
}

// 2) 직접 편집 전환 → 박자는 자동과 같은 곳에서 나옴
let m = toEdit(base, 200);
assert.equal(m.mode, 'edit');
assert(m.clips.length >= 4 && m.clips.every((c) => c.id && !c.id.startsWith('auto')));
{
  const a = beatsOnTimeline(base, 120).map((b) => b.t.toFixed(2));
  const e = beatsOnTimeline(m, 120).map((b) => b.t.toFixed(2));
  const sa = new Set(a);
  const same = e.filter((t) => sa.has(t)).length / Math.max(a.length, e.length);
  assert(same > 0.9, '직접 편집으로 바꿔도 박자 위치 거의 동일: ' + same.toFixed(2));
  assert.equal(toAuto(m).mode, 'auto');
  assert.equal(toAuto(m).clips.length, 0);
}

// 3) 옮기기: 같은 레이어에서 겹치면 가장 가까운 빈자리로, 다른 레이어와 겹치면 자동 교차 페이드
{
  const one = appendTrack(toAuto({ ...base, tracks: [A, B] }), A);
  assert.equal(one.clips.length, 1);
  let two = placeClip(one, { path: B.path, in: 0, out: 40, fadeIn: 0, fadeOut: 0 }, 70, 0);
  const b = two.clips[1];
  assert.equal(b.layer, 0, '빈자리면 원하는 레이어');
  // 같은 레이어로 A 와 겹치게 옮기면 A 끝(60)에 붙음
  let mv = moveClip(two, b.id, 50, 0);
  assert(near(mv.clips[1].start, 60), '같은 레이어 겹침 → A 끝에 붙음: ' + mv.clips[1].start);
  // 다른 레이어에서 A 끝과 5초 겹치게 → 교차 페이드 5초
  mv = moveClip(two, b.id, 55, 1);
  const a2 = mv.clips.find((c) => c.path === A.path);
  const b2 = mv.clips.find((c) => c.id === b.id);
  assert.equal(b2.layer, 1);
  assert(near(b2.fadeIn, 5) && near(a2.fadeOut, 5), '자동 교차 페이드 5초');
  // 교차 페이드 끈 경우
  const nf = moveClip(two, b.id, 55, 1, { cross: false });
  assert.equal(nf.clips.find((c) => c.id === b.id).fadeIn, 0);
  // 레이어 수 자동 증가 + 최대 6
  assert.equal(moveClip(two, b.id, 0, 4).layers, 5);
  assert.equal(moveClip(two, b.id, 0, 99).clips[1].layer, 5);
}

// 4) 자르기: 앞쪽은 원곡 시작 이전으로 못 늘림, 뒤쪽은 원곡 끝·다음 조각에서 멈춤, 최소 길이
{
  let s = appendTrack(toAuto(base), A); // 0~60
  const id = s.clips[0].id;
  let t = trimClip(s, id, 'in', 10);
  assert(near(t.clips[0].start, 10) && near(t.clips[0].in, 10), '앞 자르기');
  t = trimClip(t, id, 'in', -5);
  assert(near(t.clips[0].start, 0) && near(t.clips[0].in, 0), '원곡 시작 이전 불가');
  t = trimClip(s, id, 'out', 30);
  assert(near(t.clips[0].out, 30));
  t = trimClip(t, id, 'out', 999);
  assert(near(t.clips[0].out, 60), '원곡 끝 이후 불가');
  t = trimClip(s, id, 'out', 0.1);
  assert(near(t.clips[0].out - t.clips[0].in, 0.5), '최소 길이 0.5초');
  // 다음 조각에서 멈춤
  s = placeClip(s, { path: B.path, in: 0, out: 40, fadeIn: 0, fadeOut: 0 }, 70, 0);
  t = trimClip(trimClip(s, id, 'out', 50), id, 'out', 90);
  assert(near(clipEnd(t.clips[0]), 60), '원곡 끝(60) 이 먼저');
  // 페이드는 길이에 맞춰 줄어듦
  const f = trimClip(setFade(setFade(s, id, 'fadeIn', 20), id, 'fadeOut', 30), id, 'out', 10);
  const c = f.clips[0];
  assert(c.fadeIn + c.fadeOut <= c.out - c.in + 1e-6, '페이드 합 ≤ 길이');
}

// 5) 나누기 · 붙여넣기 · 삭제
{
  const s = appendTrack(toAuto(base), A);
  const id = s.clips[0].id;
  const s2 = setFade(setFade(s, id, 'fadeIn', 2), id, 'fadeOut', 4);
  const sp = splitClip(s2, id, 25);
  assert.equal(sp.clips.length, 2);
  const [a, b] = sp.clips;
  assert(near(a.out, 25) && near(b.in, 25) && near(b.start, 25), '이어지는 두 조각');
  assert(a.fadeIn === 2 && a.fadeOut === 0 && b.fadeIn === 0 && b.fadeOut === 4, '페이드는 바깥쪽만 유지');
  assert.equal(splitClip(s2, id, 0.05), s2, '가장자리에서는 나누지 않음');
  // 붙여넣기: 같은 자리에 붙이면 빈 레이어로
  const pc = placeClip(sp, b, 30, 0);
  assert.equal(pc.clips[2].layer, 1, '차 있으면 다른 레이어');
  assert.notEqual(pc.clips[2].id, b.id, '새 id');
  assert.equal(deleteClips(pc, [a.id]).clips.length, 2);
}

// 6) 영상 길이 채우기: 마지막 조각을 교차 페이드로 반복
{
  const s = appendTrack(toAuto(base), B); // 40초
  const f = fillToEnd(s, 150, 3);
  assert(clipEnd(f.clips.reduce((x, y) => (clipEnd(y) > clipEnd(x) ? y : x))) >= 150, '끝까지 채움');
  assert(f.clips.length === 4, '40·37·37·37 → 4조각: ' + f.clips.length);
  for (let i = 1; i < f.clips.length; i++) {
    assert(near(f.clips[i].start, clipEnd(f.clips[i - 1]) - 3), '3초 겹침');
    assert(f.clips[i].layer !== f.clips[i - 1].layer, '레이어 번갈아');
    assert(near(f.clips[i].fadeIn, 3) && near(f.clips[i - 1].fadeOut, 3));
  }
  assert.deepEqual(silentGaps(f, 150), [], '비는 곳 없음');
  assert.equal(silentGaps(s, 150).length, 1, '채우기 전에는 끝부분 무음');
  // 이어 붙이기 (곡 추가)
  const ap = appendTrack(s, A, 3);
  assert(near(ap.clips[1].start, 37) && ap.clips[1].layer === 1 && near(ap.clips[0].fadeOut, 3));
}

// 7) 레이어: 추가·빈 레이어 삭제·소리 끄기
{
  let s = appendTrack(toAuto(base), A);
  s = addLayer(addLayer(s));
  assert.equal(s.layers, 4);
  s = placeClip(s, { path: B.path, in: 0, out: 10, fadeIn: 0, fadeOut: 0 }, 0, 3);
  assert.equal(s.clips[1].layer, 3);
  assert.equal(removeLayer(s, 3), s, '조각 있는 레이어는 못 지움');
  const r = removeLayer(s, 1);
  assert(r.layers === 3 && r.clips[1].layer === 2, '뒤 레이어가 당겨짐');
  const mu = toggleMute(s, 3);
  assert.equal(activeClips(mu).length, 1, '소리 끈 레이어 제외');
  assert(!usedPaths(mu).has(B.path), '소리 끈 곡은 출처 표기 안 함');
  assert(usedPaths(s).has(B.path));
}

// 8) 곡 목록에서 지우면 조각도 정리 · 페이드 곡선 · 달라붙기
{
  const s = fillToEnd(appendTrack(toAuto(base), A), 200);
  assert.equal(removeTrackClips(s, A.path).clips.length, 0);
  const c = { start: 10, in: 0, out: 20, fadeIn: 4, fadeOut: 4 };
  assert.equal(clipGain(c, 9), 0);
  assert(near(clipGain(c, 12), Math.sin(Math.PI / 4)), '페이드 곡선 qsin');
  assert.equal(clipGain(c, 20), 1);
  assert.equal(snapTime(s, null, 59.7, [100], 0.5), 60, '조각 끝에 붙음');
  assert.equal(snapTime(s, null, 99.8, [100], 0.5), 100, '재생 위치에 붙음');
  assert.equal(snapTime(s, null, 80, [100], 0.5), 80);
}

// 9) 다른 기능과 연동: 저장 파일 호환, 길이, 점검, 박자 맞춤
{
  const old = normalizeProject({ music: { tracks: [A] } });
  assert(old.music.mode === 'auto' && Array.isArray(old.music.clips), '예전 파일은 자동');
  const p = { ...defaultProject(), items: Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, type: 'photo', path: '/r/' + i + '.jpg' })) };
  const tl0 = buildTimeline(p);
  const short = { ...p, music: appendTrack(toAuto({ ...p.music, tracks: [B] }), B) };
  assert(near(musicLength(short.music), 40), '직접 편집 음악 길이 = 마지막 조각 끝');
  const cl = checklist(short, tl0);
  assert(cl.some((x) => x.level === 'warn' && x.text.includes('비는 구간')), '무음 구간 경고');
  const filled = { ...short, music: fillToEnd(short.music, tl0.total) };
  assert(!checklist(filled, tl0).some((x) => x.text.includes('비는 구간')), '채우면 경고 없음');
  // 박자 맞춤이 직접 편집 음악의 박자로 동작
  const tl = buildTimeline(filled);
  assert(tl.beatSynced > 0, '직접 편집 음악으로 박자 맞춤');
  // 비어 있는 직접 편집
  const empty = { ...p, music: { ...toEdit({ ...p.music, tracks: [A] }, 100), clips: [] } };
  assert(checklist(empty, tl0).some((x) => x.text.includes('조각이 없어')));
}

// 10) 박자: 겹치는 곳은 크게 들리는 조각 우선, 소리 작은 곳(페이드 초반)은 제외
{
  const s = toEdit({ ...base, tracks: [A, B] }, 100);
  const bs = editBeats(s, 100);
  for (let i = 1; i < bs.length; i++) assert(bs[i].t - bs[i - 1].t >= 0.12 - 1e-9, '박자 간격');
}
// 11) 검토 반영: 나누기 이음매 연속 · 원곡 구간만 바꾸기 · 겹침이 풀리면 자동 교차 페이드 해제 · 조각 수 한도
{
  // 페이드아웃 도중에서 나누기 → 이음매 앞뒤 크기 같음
  const s = appendTrack(toAuto(base), A); // 0~60
  const id = s.clips[0].id;
  const f = setFade(setFade(s, id, 'fadeIn', 10), id, 'fadeOut', 20);
  for (const t of [5, 50]) {
    const sp = splitClip(f, id, t);
    const [a, b] = sp.clips;
    const ga = clipGain(a, t - 1e-6);
    const gb = clipGain(b, t + 1e-6);
    assert(Math.abs(ga - gb) < 0.02, `이음매(${t}초) 크기 연속: ${ga.toFixed(2)} / ${gb.toFixed(2)}`);
  }
  // 원곡 구간: 시작 위치는 그대로
  const r = setRange(s, id, 30, 50);
  assert(r.clips[0].start === 0 && r.clips[0].in === 30 && r.clips[0].out === 50, '원곡 30~50초, 영상 0초부터');
  assert.equal(setRange(s, id, 59.9, 60).clips[0].out - setRange(s, id, 59.9, 60).clips[0].in, 0.5, '최소 길이');
  // 겹침이 풀리면 자동 교차 페이드도 해제
  const two = placeClip(s, { path: B.path, in: 0, out: 40, fadeIn: 0, fadeOut: 0 }, 70, 1);
  const bid = two.clips[1].id;
  const x = moveClip(two, bid, 55, 1);
  assert(near(x.clips[0].fadeOut, 5) && near(x.clips[1].fadeIn, 5));
  const away = moveClip(x, bid, 80, 1);
  assert(away.clips[0].fadeOut === 0 && away.clips[1].fadeIn === 0, '겹침 풀리면 교차 페이드 해제');
  // 직접 넣은 페이드는 그대로
  const manual = setFade(two, bid, 'fadeIn', 2);
  assert.equal(moveClip(manual, bid, 90, 1).clips[1].fadeIn, 2, '직접 조절한 페이드 유지');
  // 아주 긴 반복 → 조각 수 한도 (내보내기와 같음)
  const many = toEdit({ ...base, tracks: [{ path: '/m/s.mp3', duration: 3 }], crossfade: 0.5 }, 3600);
  assert(many.clips.length <= 200, '조각 수 한도');
}
console.log('music-test: 모두 통과');
