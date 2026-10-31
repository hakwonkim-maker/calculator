// 프로젝트 → 타임라인(세그먼트 배열) 변환
// 세그먼트는 앞뒤 전환 구간만큼 서로 겹친다. 전환 중에도 두 장면의 모션이 계속 움직여
// "멈춘 사진이 바뀌는" 느낌이 아니라 흐르듯 이어지게 한다.

import { TRANSITION_STYLES, MOTION_LEVELS, MONTAGE_STYLES, MONTAGE_FREQ, introTiming } from './presets.js';
import { hashStr, rng, weightedPick } from './math.js';
import { beatsOnTimeline } from './beats.js';

const INTRO_EXIT = { golden: 'lightLeak', mosaic: 'zoomBlur', light: 'dipWhite', cinematic: 'dipBlack', polaroid: 'blurDissolve', bloom: 'dipWhite', minimal: 'fade', filmleader: 'filmBurn', timeroll: 'dipWhite', flashcut: 'zoomBlur' };
const MONTAGE_ORDER = ['grid', 'polaroid', 'split', 'filmstrip'];

/** 몽타주에 넣어도 되는 사진: 자막·개별 설정이 없는 사진 (개별 설정한 사진은 단독 장면 유지) */
function montageEligible(it) {
  return it.type === 'photo' && !it.caption && !it.label && !it.noMontage && !Number(it.duration) && !(it.motion && it.motion !== 'auto') && !(it.transition && it.transition !== 'auto') && !it.focus;
}

/** 사진이 들어 있던 폴더 이름 (예: 'D:\\사진\\2019_체육대회\\a.jpg' → '2019 체육대회') */
export function folderOf(it) {
  const raw = it.folder || (/^(blob:|data:|https?:)/.test(it.path || '') ? '' : String(it.path || '').split(/[\\/]/).slice(-2, -1)[0] || '');
  let name = raw.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  // '01_창립식', '3. 체육대회' 같은 정렬용 번호는 떼어냄 (연도 '2019'는 유지)
  const stripped = name.replace(/^\d{1,3}\s*[.\-)\]]?\s+/, '').replace(/^\d{1,3}[.\-)\]]\s*/, '');
  if (stripped) name = stripped;
  return name.slice(0, 40);
}

/**
 * 사진 사이사이에 몽타주 장면을 자동 배치 (시드 기반 → 항상 같은 결과).
 * 반환: [{ type:'photo', item } | { type:'group', items, style }] (챕터는 그대로)
 */
export function planMontage(items, style) {
  const freq = MONTAGE_FREQ[style.montage || 'normal'];
  const out = [];
  if (!freq || !freq.gap) {
    for (const it of items) out.push({ type: it.type, item: it });
    return out;
  }
  const r = rng(hashStr(`${style.seed || 1}|montage`));
  const nextGap = () => freq.gap[0] + Math.floor(r() * (freq.gap[1] - freq.gap[0] + 1));
  let gap = Math.max(3, nextGap() - 2); // 첫 몽타주는 조금 일찍
  let since = 0;
  let prevStyle = null;
  // 네 가지 몽타주를 섞은 묶음에서 차례로 꺼내 고르게 돌아가며 나오게 함
  let bag = [];
  const draw = () => {
    if (!bag.length) {
      bag = MONTAGE_ORDER.slice();
      for (let k = bag.length - 1; k > 0; k--) {
        const j = Math.floor(r() * (k + 1));
        [bag[k], bag[j]] = [bag[j], bag[k]];
      }
      if (bag[0] === prevStyle) bag.push(bag.shift());
    }
    return bag.shift();
  };
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.type !== 'photo') {
      out.push({ type: it.type, item: it });
      since = Math.min(since, gap - 2); // 챕터 바로 뒤에는 몽타주를 미룸
      i++;
      continue;
    }
    if (since >= gap) {
      // 무작위 값은 사용자가 바꾼 몽타주가 있어도 똑같이 소비 → 다른 몽타주는 그대로 유지
      const auto = draw();
      const [amn, amx] = MONTAGE_STYLES[auto].size;
      const autoWant = amn + Math.floor(r() * (amx - amn + 1));
      // 사용자가 이 자리의 몽타주를 바꿨거나(it.montage = 스타일) 풀었으면('off') 그대로 따름
      const ov = it.montage;
      let ms = ov && MONTAGE_STYLES[ov] ? ov : auto;
      const count = (w) => {
        let c = 0;
        while (i + c < items.length && c < w && montageEligible(items[i + c])) c++;
        return c;
      };
      let [mn, mx] = MONTAGE_STYLES[ms].size;
      let n = count(ms === auto ? autoWant : Math.min(mx, Math.max(mn, autoWant)));
      if (ms !== auto && n < mn) {
        // 바꾼 스타일에 필요한 사진 수가 모자라면 원래 스타일 유지
        ms = auto;
        [mn, mx] = [amn, amx];
        n = count(autoWant);
      }
      if (ov === 'off' && n >= amn) {
        // 풀린 몽타주: 같은 사진들을 한 장씩 보여 주고, 다음 몽타주 간격은 원래대로
        for (const x of items.slice(i, i + n)) out.push({ type: 'photo', item: x });
        i += n;
        prevStyle = auto;
        since = 0;
        gap = nextGap();
        continue;
      }
      // 남은 사진이 너무 적으면(끝부분) 몽타주 대신 일반 사진으로
      if (n >= mn && items.length - (i + n) >= 2) {
        out.push({ type: 'group', items: items.slice(i, i + n), style: ms, custom: ms !== auto });
        i += n;
        prevStyle = auto; // 사용자가 바꾼 스타일이 다음 몽타주 선택에 영향을 주지 않도록
        since = 0;
        gap = nextGap();
        continue;
      }
    }
    out.push({ type: 'photo', item: it });
    since++;
    i++;
  }
  return out;
}

/** 몽타주 장면 길이: 사진 수에 비례하되 너무 길거나 짧지 않게 */
function groupDuration(n, pd, style) {
  const per = style === 'filmstrip' ? 0.5 : style === 'split' ? 0.85 : 0.65;
  return Math.min(10, Math.max(3.4, n * pd * per + 1.2));
}
const MOTIONS = [
  ['zoomIn', 3],
  ['zoomOut', 2.4],
  ['panLeft', 1.5],
  ['panRight', 1.5],
  ['panUp', 0.8],
  ['panDown', 0.6],
];

export const CHAPTER_DEFAULT_DURATION = 4.2;
export const MIN_PHOTO_DURATION = 0.5;

/** 사진이 짧으면 전환도 짧게 (사진이 최소 0.4초 + 전환의 절반 이상은 온전히 보이도록) */
function effectiveT(T, pd) {
  return Math.max(0.2, Math.min(T, (pd - 0.25) * 0.6));
}

/**
 * 자동 선별로 '제외'(skip)된 사진을 뺀 프로젝트. 사진이 하나도 남지 않은 챕터 카드도 함께 뺌.
 * (원본 목록은 그대로 두어 언제든 선별을 해제할 수 있게 함)
 */
export function usedItems(project) {
  if (!project.items.some((i) => i.skip)) return project;
  const kept = project.items.filter((i) => !(i.type === 'photo' && i.skip));
  const items = kept.filter((it, k) => {
    if (it.type !== 'chapter') return true;
    for (let j = k + 1; j < kept.length && kept[j].type !== 'chapter'; j++) if (kept[j].type === 'photo') return true;
    return false;
  });
  return { ...project, items };
}

/**
 * 타임라인 생성.
 * style.lengthMode === 'total' 이면 style.targetDuration(초)에 맞도록
 * '사진 1장당 시간'을 자동 계산한다 (사진을 더 넣어도 전체 길이는 유지).
 */
export function buildTimeline(project) {
  project = usedItems(project);
  const st = project.style;
  const T = Math.max(0.3, Number(st.transitionDuration) || 1.2);
  const nAuto = project.items.filter((i) => i.type === 'photo' && !Number(i.duration)).length;
  const target = Number(st.targetDuration) || 0;
  if (st.lengthMode !== 'total' || !nAuto || target <= 0) {
    const pd = Math.max(MIN_PHOTO_DURATION, Number(st.photoDuration) || 4.5);
    return syncToBeats({ ...buildCore(project, pd, effectiveT(T, pd)), photoDuration: pd }, project, 0);
  }
  // 전체 길이 고정: 총 길이(pd)는 거의 선형이므로 할선법으로 2~4회 만에 수렴
  const total = (pd) => buildCore(project, pd, effectiveT(T, pd)).total;
  let pd = 3 + (target - total(3)) / Math.max(1e-6, total(4) - total(3));
  for (let k = 0; k < 4; k++) {
    pd = Math.min(60, Math.max(MIN_PHOTO_DURATION, pd));
    const err = target - total(pd);
    if (Math.abs(err) < 0.02) break;
    const slope = (total(pd + 0.5) - total(pd)) / 0.5;
    pd += err / Math.max(1e-6, slope);
  }
  pd = Math.min(60, Math.max(MIN_PHOTO_DURATION, pd));
  const tl = buildCore(project, pd, effectiveT(T, pd));
  return syncToBeats({ ...tl, photoDuration: pd, target, fitShort: tl.total > target + 0.5 }, project, tl.total);
}

/**
 * 음악 박자에 장면 전환 맞추기: 각 전환의 한가운데(새 사진이 반쯤 보이는 순간)를 가까운 박자로 옮긴다.
 * - 전환마다 원래 위치 근처(±약 1박)에서 '센 박자'(마디 첫 박 등)를 우선 선택 → 오차가 쌓이지 않음
 * - 장면이 너무 짧아지거나 인트로 글자가 잘리지 않게 최소 길이 보장
 * - keepTotal(전체 길이 고정 모드)이면 마지막 장면 길이로 전체 길이를 원래대로 맞춤
 */
function syncToBeats(tl, project, keepTotal) {
  if (project.style.beatSync === false) return tl;
  const segs = tl.segments;
  if (segs.length < 3) return tl;
  const beats = beatsOnTimeline(project.music, tl.total);
  if (beats.length < 8) return tl;
  const bi = (beats[beats.length - 1].t - beats[0].t) / (beats.length - 1);
  const orig = segs.map((s) => s.start);
  let synced = 0;
  let j = 0;
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1];
    const b = segs[i];
    const cut = orig[i] + b.tIn / 2;
    const win = Math.max(0.15, Math.min(bi * 1.05, Math.min(a.dur, b.dur) * 0.3));
    while (j < beats.length && beats[j].t < cut - win) j++;
    let best = null;
    let bestScore = -1;
    for (let k = j; k < beats.length && beats[k].t <= cut + win; k++) {
      const sc = (0.2 + beats[k].s) * (1 - (0.45 * Math.abs(beats[k].t - cut)) / win);
      if (sc > bestScore) {
        bestScore = sc;
        best = beats[k].t;
      }
    }
    let ns = (best == null ? cut : best) - b.tIn / 2;
    const minDur = a.type === 'intro' ? a.dur - 0.5 : a.tIn + a.tOut + (a.type === 'photo' ? 0.6 : 0.9);
    const low = a.start + minDur - a.tOut;
    if (ns < low) ns = low;
    else if (best != null) synced++;
    a.dur = ns - a.start + a.tOut;
    b.start = ns;
  }
  const last = segs[segs.length - 1];
  if (keepTotal) last.dur = Math.max(last.tIn + 1, keepTotal - last.start);
  return { ...tl, total: last.start + last.dur, beatSynced: synced, beatInterval: bi };
}

function buildCore(project, photoDuration, T) {
  const st = { ...project.style, photoDuration };
  const seed = st.seed || 1;
  const pool = (TRANSITION_STYLES[st.transitionStyle] || TRANSITION_STYLES.elegant).pool;
  const motionAmt = MOTION_LEVELS[st.motion] ?? 1;

  const raw = [];
  if (project.intro.enabled) {
    // 글자가 다 나오기 전에 인트로가 끝나지 않도록 필요한 길이만큼 자동 연장
    const d0 = Number(project.intro.duration) || 10;
    const req = introTiming(project.intro, d0).required + 1.8;
    raw.push({ type: 'intro', key: 'intro', dur: Math.max(d0, req), extended: req > d0 + 0.05 });
  }
  for (const p of planMontage(project.items, st)) {
    const it = p.item;
    if (p.type === 'group') raw.push({ type: 'group', key: 'g:' + p.items[0].id, items: p.items, style: p.style, custom: p.custom, dur: groupDuration(p.items.length, st.photoDuration, p.style) + T });
    else if (it.type === 'photo') raw.push({ type: 'photo', key: it.id, item: it, dur: (Number(it.duration) || st.photoDuration) + T });
    else if (it.type === 'chapter') raw.push({ type: 'chapter', key: it.id, item: it, dur: (Number(it.duration) || CHAPTER_DEFAULT_DURATION) + T });
  }
  if (project.outro.enabled) {
    let od = Number(project.outro.duration) || 10;
    // 크레딧이 길면 읽을 수 있는 속도(초당 약 2.2줄)가 되도록 엔딩을 자동으로 늘림
    if (project.outro.style === 'credits') od = Math.max(od, (String(project.text.credits || '').split('\n').length / 2.2 + 3) / 0.62 + 2);
    raw.push({ type: 'outro', key: 'outro', dur: od });
  }

  // 경계(전환) 결정
  let prevTrans = null;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1];
    const b = raw[i];
    let id = null;
    let dur = T;
    const own = a.type === 'intro' ? project.intro.transition : a.type === 'group' ? null : a.item?.transition;
    const explicit = own && own !== 'auto' ? own : null;
    if (explicit) id = explicit;
    else if (a.type === 'intro') {
      id = INTRO_EXIT[project.intro.style] || 'lightLeak';
      dur = Math.max(T, 1.8);
    } else if (b.type === 'outro') {
      id = 'blurDissolve';
      dur = Math.max(T, 2.0);
    } else if (b.type === 'chapter') {
      id = 'dipBlack';
      dur = Math.max(T, 1.4);
    } else if (a.type === 'chapter') {
      id = 'blurDissolve';
      dur = Math.max(T, 1.4);
    } else {
      const r = rng(hashStr(`${seed}|${a.key}|${b.key}`));
      id = weightedPick(r, pool, prevTrans);
    }
    if (a.type === 'intro' && explicit) dur = Math.max(T, 1.8);
    if (id === 'none') dur = 0.0001;
    prevTrans = id;
    b.transIn = id;
    b.tIn = dur;
    a.tOut = dur;
  }

  // 길이 보정: 전환이 겹쳐도 장면이 최소 0.4초는 단독으로 보이도록
  for (const s of raw) {
    s.tIn = s.tIn || 0;
    s.tOut = s.tOut || 0;
    s.dur = Math.max(s.dur, s.tIn + s.tOut + (s.type === 'photo' ? 0.25 : 0.4));
  }

  // 시작 시간 계산
  let t = 0;
  let prevMotion = null;
  raw.forEach((s, i) => {
    s.index = i;
    s.start = t;
    t = s.start + s.dur - s.tOut;
    if (s.type === 'photo') {
      const r = rng(hashStr(`${seed}|m|${s.key}`));
      let m = weightedPick(r, MOTIONS, prevMotion);
      const fx = r() * 2 - 1;
      const fy = r() * 2 - 1;
      const own = s.item.motion;
      if (own && own !== 'auto') m = own === 'none' ? 'zoomIn' : own;
      prevMotion = m;
      s.motion = { type: m, amount: own === 'none' ? 0 : motionAmt, fx, fy };
    }
  });
  // 챕터 카드 배경으로 쓸 다음 사진
  raw.forEach((s, i) => {
    if (s.type !== 'chapter') return;
    const nx = raw.slice(i + 1).find((x) => x.type === 'photo') || raw.slice(0, i).reverse().find((x) => x.type === 'photo');
    s.nextPhoto = nx ? nx.item : null;
    // 배경 콜라주용: 이 챕터 구간(다음 챕터 전까지)의 사진 최대 6장 (★대표 사진 우선, 고르게)
    const sec = [];
    for (let k = i + 1; k < raw.length && raw[k].type !== 'chapter'; k++) {
      if (raw[k].type === 'photo') sec.push(raw[k].item);
      else if (raw[k].type === 'group') sec.push(...raw[k].items);
    }
    const starred = sec.filter((x) => x.star);
    const rest = sec.filter((x) => !x.star);
    const pick = starred.slice(0, 6);
    const need = 6 - pick.length;
    for (let k = 0; k < need && k < rest.length; k++) pick.push(rest[Math.floor(((k + 0.5) * rest.length) / Math.min(need, rest.length))]);
    s.sectionPhotos = [...new Set(pick)];
  });
  const last = raw[raw.length - 1];
  const total = last ? last.start + last.dur : 0;
  if (last) last.isLast = true; // 마지막 장면: 음악 출처(CC BY) 표기 위치

  // 인트로/아웃트로 갤러리용 사진: ★대표 사진을 먼저, 부족하면 전체에서 고르게 채움 (최대 30장)
  const photos = project.items.filter((it) => it.type === 'photo');
  const starred = photos.filter((p) => p.star);
  let gallery = starred.slice(0, 30);
  if (gallery.length < 30) {
    const rest = sampleEven(photos.filter((p) => !p.star), 30 - gallery.length);
    gallery = starred.length >= 6 ? gallery : [...gallery, ...rest];
  }
  // 폴더명 표시: 'all' = 모든 사진 장면, 'change' = 폴더가 바뀌는 첫 장면만
  const fl = st.folderLabel || 'off';
  if (fl !== 'off') {
    let prevF = null;
    for (const s of raw) {
      if (s.type !== 'photo' && s.type !== 'group') continue;
      const f = folderOf(s.item || s.items[0]);
      if (f && (fl === 'all' || f !== prevF)) s.folder = f;
      prevF = s.items ? folderOf(s.items[s.items.length - 1]) : f;
    }
  }
  // 세그먼트 → 사진 id 찾기용 (몽타주 속 사진 포함)
  const byItem = new Map();
  for (const s of raw) {
    if (s.item) byItem.set(s.item.id, s);
    if (s.items) for (const it of s.items) byItem.set(it.id, s);
  }

  return { segments: raw, total, gallery, T, byItem };
}

function sampleEven(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor((i * arr.length) / n)]);
  return out;
}

/** 시간 t에서 보이는 세그먼트(최대 2개)와 전환 진행률 */
export function activeAt(tl, t) {
  const segs = tl.segments;
  if (!segs.length) return null;
  t = Math.min(Math.max(t, 0), Math.max(0, tl.total - 1e-4));
  // 이진 탐색: start <= t 인 마지막 세그먼트
  let lo = 0;
  let hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  const b = segs[lo];
  const a = lo > 0 ? segs[lo - 1] : null;
  if (a && t < a.start + a.dur && b.tIn > 0.001) {
    return { from: a, to: b, p: (t - b.start) / b.tIn, transition: b.transIn };
  }
  return { from: b, to: null, p: 0, transition: 'none' };
}

/** 목표 길이에 맞는 사진 1장당 시간 (사진이 없으면 null) */
export function fitPhotoDurationToLength(project, targetSeconds) {
  project = usedItems(project);
  const nPhotos = project.items.filter((i) => i.type === 'photo' && !Number(i.duration)).length;
  if (!nPhotos) return null;
  const tl = buildTimeline({ ...project, style: { ...project.style, lengthMode: 'total', targetDuration: targetSeconds } });
  return Math.round(tl.photoDuration * 100) / 100;
}

/** 전체 길이 고정 모드에서 최소로 줄였을 때의 길이 (사진이 너무 많은지 판단용) */
export function minimumLength(project) {
  project = usedItems(project);
  const T = Math.max(0.3, Number(project.style.transitionDuration) || 1.2);
  return buildCore(project, MIN_PHOTO_DURATION, effectiveT(T, MIN_PHOTO_DURATION)).total;
}
