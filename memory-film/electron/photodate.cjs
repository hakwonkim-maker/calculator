// 사진 날짜 추정: 정렬·연도 챕터의 기준
// 오래된 사진은 필름 사진을 스캔했거나 메신저로 받아 EXIF 촬영일이 없는 경우가 많다.
// 그대로 파일 날짜(스캔·복사한 날)를 쓰면 1999년 사진이 2003년 사진보다 뒤로 밀리므로
// 파일 이름·폴더 이름에 적힌 날짜/연도를 함께 본다.
//
// 우선순위
//  1) EXIF 촬영일(DateTimeOriginal/CreateDate) — 단, 파일·폴더 이름의 연도와 다르면 이름을 따름
//     (스캐너가 스캔한 날을 촬영일로 기록하는 경우)
//  2) 파일 이름의 날짜 (19990512, 1999-05-12, IMG_20030101_..., KakaoTalk_20190101...)
//  3) 파일 이름 / 가까운 폴더 이름의 연도 (1999_체육대회, 2019년 송년회)
//  4) EXIF 수정일(ModifyDate) · 파일 날짜
const path = require('path');

const MIN_YEAR = 1900;
const maxYear = () => new Date().getFullYear() + 1;
const validYear = (y) => y >= MIN_YEAR && y <= maxYear();

/** 이름에서 연-월-일 (예: 20030101, 2003-01-01, 2003.1.1, 2003년 1월 1일) */
function fullDateIn(name) {
  const s = String(name);
  const pats = [
    /(?:^|[^0-9])((?:19|20)\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/, // 20030101 (뒤에 _시간 가능)
    /(?:^|[^0-9])((?:19|20)\d{2})[-._ ](\d{1,2})[-._ ](\d{1,2})(?:[^0-9]|$)/, // 2003-01-01 / 2003.1.1
    /((?:19|20)\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/, // 2003년 1월 1일
  ];
  for (const re of pats) {
    const m = re.exec(s);
    if (!m) continue;
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (validYear(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(y, mo - 1, d, 12).getTime();
  }
  return null;
}

/** 이름에서 연도 하나 (예: '1999_체육대회', '2019년 송년회'). 서로 다른 연도가 둘 이상이면(1999-2005) 판단하지 않음 */
function yearIn(name) {
  const ys = [...String(name).matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?=[^0-9]|$)/g)].map((m) => +m[1]).filter(validYear);
  const uniq = [...new Set(ys)];
  return uniq.length === 1 ? uniq[0] : null;
}

const startOfYear = (y) => new Date(y, 0, 1).getTime();

/** 기준 시각 ts의 '연중 위치'를 유지한 채 연도만 y로 옮김 → 같은 폴더 안의 순서는 원래 날짜대로 */
function moveToYear(ts, y) {
  if (!ts) return new Date(y, 6, 1).getTime();
  const d = new Date(ts);
  const off = Math.min(ts - startOfYear(d.getFullYear()), 364 * 86400000);
  return startOfYear(y) + Math.max(0, off);
}

/**
 * file: 전체 경로 · root: 사용자가 고른 폴더(이보다 위 폴더 이름은 보지 않음)
 * exif: { original?: Date, create?: Date, modify?: Date } · fileTime: 파일 날짜(ms)
 */
function inferDate({ file, root, exif = {}, fileTime }) {
  const base = path.basename(file, path.extname(file));
  const ok = (v) => v instanceof Date && !isNaN(v) && validYear(v.getFullYear());
  const shot = ok(exif.original) ? exif.original : ok(exif.create) ? exif.create : null;

  // 폴더 이름: 사진에서 가까운 폴더부터, 사용자가 고른 폴더까지
  let folderYear = null;
  let dir = path.dirname(file);
  const stop = root ? path.resolve(root) : null;
  for (let i = 0; i < (stop ? 6 : 2) && dir; i++) {
    const y = yearIn(path.basename(dir));
    if (y) {
      folderYear = y;
      break;
    }
    if (stop && path.resolve(dir) === stop) break;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const nameDate = fullDateIn(base);
  // IMG_1999.jpg · DSC_2003.jpg 의 숫자는 카메라 일련번호라 연도로 보지 않음
  const counter = /^[A-Za-z]{1,6}[_ -]?\d{4,5}([_ -(]+\d{1,3}\)?)?$/.test(base);
  const nameYear = nameDate ? new Date(nameDate).getFullYear() : counter ? null : yearIn(base);
  const hintYear = nameYear || folderYear;

  // EXIF가 이름과 같은 해(폴더 이름은 행사가 해를 넘기는 경우를 감안해 ±1년)면 EXIF를 그대로 신뢰
  const agrees = shot && (!hintYear || shot.getFullYear() === hintYear || (!nameYear && Math.abs(shot.getFullYear() - folderYear) <= 1));
  if (agrees) return { date: shot.getTime(), dateSource: 'exif' };
  if (nameDate) return { date: nameDate, dateSource: 'name' };
  const fallback = shot ? shot.getTime() : ok(exif.modify) ? exif.modify.getTime() : fileTime;
  if (nameYear) return { date: moveToYear(fallback, nameYear), dateSource: 'name' };
  if (folderYear) return { date: moveToYear(fallback, folderYear), dateSource: 'folder' };
  if (ok(exif.modify)) return { date: exif.modify.getTime(), dateSource: 'file' };
  return { date: fileTime, dateSource: 'file' };
}

module.exports = { inferDate, fullDateIn, yearIn };
