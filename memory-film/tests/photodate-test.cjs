// 사진 날짜 추정 단위 테스트: node tests/photodate-test.cjs
const assert = require('assert');
const { inferDate } = require('../electron/photodate.cjs');
const Y = (r) => new Date(r.date).getFullYear();
const D = (s) => new Date(s);
const cases = [
  // [설명, 입력, 기대 연도, 기대 출처]
  ['EXIF 정상', { file: '/r/사진/a.jpg', root: '/r', exif: { original: D('2003-05-01T10:00') }, fileTime: +D('2015-01-01') }, 2003, 'exif'],
  ['스캔 사진(EXIF 없음) + 폴더 연도', { file: '/r/1999_창립식/scan001.jpg', root: '/r', exif: {}, fileTime: +D('2015-03-02') }, 1999, 'folder'],
  ['스캔 사진 + 폴더 연도(한글)', { file: '/r/1999년 체육대회/a.jpg', root: '/r', exif: {}, fileTime: +D('2015-03-02') }, 1999, 'folder'],
  ['스캐너가 스캔일을 EXIF에 기록', { file: '/r/1999 창립/s.jpg', root: '/r', exif: { original: D('2014-06-01') }, fileTime: +D('2014-06-01') }, 1999, 'folder'],
  ['폴더 연도 ±1년은 EXIF 신뢰', { file: '/r/2019 송년회/a.jpg', root: '/r', exif: { original: D('2020-01-01T00:30') }, fileTime: 0 }, 2020, 'exif'],
  ['파일 이름 날짜', { file: '/r/x/KakaoTalk_19990512_101010.jpg', root: '/r', exif: {}, fileTime: +D('2020-01-01') }, 1999, 'name'],
  ['파일 이름 날짜(구분자)', { file: '/r/x/1999-05-12 졸업.jpg', root: '/r', exif: {}, fileTime: +D('2020-01-01') }, 1999, 'name'],
  ['카메라 일련번호는 연도 아님', { file: '/r/x/IMG_1999.jpg', root: '/r', exif: { original: D('2003-01-01') }, fileTime: 0 }, 2003, 'exif'],
  ['카메라 일련번호 + EXIF 없음 → 파일 날짜', { file: '/r/x/DSC_2003.jpg', root: '/r', exif: {}, fileTime: +D('2011-01-01') }, 2011, 'file'],
  ['편집일(ModifyDate)보다 폴더 연도 우선', { file: '/r/1998/a.jpg', root: '/r', exif: { modify: D('2003-02-02') }, fileTime: +D('2003-02-02') }, 1998, 'folder'],
  ['연도 범위 폴더는 판단 안 함', { file: '/r/1999-2005 사진/a.jpg', root: '/r', exif: {}, fileTime: +D('2012-01-01') }, 2012, 'file'],
  ['고른 폴더 위는 보지 않음', { file: '/2001 백업/r/a.jpg', root: '/2001 백업/r', exif: {}, fileTime: +D('2012-01-01') }, 2012, 'file'],
  ['상위 폴더 연도 (하위 폴더에 연도 없음)', { file: '/r/1999/행사/a.jpg', root: '/r', exif: {}, fileTime: +D('2012-01-01') }, 1999, 'folder'],
];
let fail = 0;
for (const [name, input, y, src] of cases) {
  const r = inferDate(input);
  const ok = Y(r) === y && r.dateSource === src;
  if (!ok) fail++;
  console.log(ok ? '✓' : '✗', name, '→', Y(r), r.dateSource);
}
// 같은 폴더 안의 순서 유지: 파일 날짜 순서가 연도 이동 후에도 유지
const a = inferDate({ file: '/r/1999/a.jpg', root: '/r', exif: {}, fileTime: +D('2015-03-02') });
const b = inferDate({ file: '/r/1999/b.jpg', root: '/r', exif: {}, fileTime: +D('2015-03-05') });
assert(a.date < b.date, '폴더 내 순서 유지');
// 핵심 시나리오: 1999 스캔 사진이 2003 디지털 사진보다 앞
const old = inferDate({ file: '/r/1999 창립/scan.jpg', root: '/r', exif: {}, fileTime: +D('2016-01-01') });
const dig = inferDate({ file: '/r/2003 야유회/DSC_0001.jpg', root: '/r', exif: { original: D('2003-04-01') }, fileTime: +D('2003-04-01') });
assert(old.date < dig.date, '1999 사진이 먼저');
console.log(fail ? `실패 ${fail}건` : '모두 통과');
process.exit(fail ? 1 : 0);
