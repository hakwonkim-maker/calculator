// 자동 사진 선별: 목표 영상 길이에 맞게 '보여 줄 사진'을 고른다 (나머지는 skip 표시만, 삭제하지 않음)
//
// 원칙 (실제 기념영상 편집자가 하는 방식)
//  1. 꼭 넣을 사진: ★대표 사진, 자막·연도 라벨을 넣은 사진, 개별 설정한 사진
//  2. 연사·중복 제거: 같은 폴더에서 몇 초 간격으로 연달아 찍은 사진은 가장 좋은 1장 먼저
//  3. 이야기 균형: 폴더(행사·연도)별로 고르게 — 사진이 많은 폴더가 적은 폴더(옛날 사진)를 밀어내지 않게
//  4. 시간 균형: 한 폴더 안에서도 처음·중간·끝이 고르게 나오게
//  5. 화질: 해상도·선명도·밝기 점수가 높은 사진 우선
import { buildTimeline, folderOf } from './timeline.js';

const isMust = (it) => !!(it.star || (it.caption && it.caption.trim()) || (it.label && it.label.trim()) || Number(it.duration) || it.focus || (it.motion && it.motion !== 'auto'));

/** 사진 점수 0~1: 분석 점수(q: 선명도·노출) + 해상도 */
export function photoScore(it) {
  const minSide = Math.min(it.w || 0, it.h || 0);
  const res = minSide ? Math.min(1, minSide / 1080) : 0.6;
  const q = typeof it.q === 'number' ? it.q : 0.55;
  return q * 0.65 + res * 0.35;
}

function groupKey(it) {
  const f = folderOf(it);
  if (f) return 'f:' + f;
  return 'y:' + (it.date ? new Date(it.date).getFullYear() : '?');
}

/** 폴더별 묶음 → 연사 묶음(cluster) */
function structure(photos) {
  const groups = [];
  let cur = null;
  const byKey = new Map();
  for (const it of photos) {
    const k = groupKey(it);
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, clusters: [] };
      byKey.set(k, g);
      groups.push(g);
    }
    const last = g.clusters[g.clusters.length - 1];
    const prev = last && last[last.length - 1];
    const burst = prev && cur === g && it.dateSource === 'exif' && prev.dateSource === 'exif' && Math.abs((it.date || 0) - (prev.date || 0)) < 4000;
    if (burst) last.push(it);
    else g.clusters.push([it]);
    cur = g;
  }
  for (const g of groups) for (const c of g.clusters) c.sort((a, b) => photoScore(b) - photoScore(a));
  return groups;
}

/** 묶음 안에서 n장을 고르게(구간별 최고 점수) 고름 */
function pickSpread(cands, k) {
  if (k <= 0) return [];
  if (cands.length <= k) return cands.slice();
  const out = [];
  for (let b = 0; b < k; b++) {
    const lo = Math.floor((b * cands.length) / k);
    const hi = Math.floor(((b + 1) * cands.length) / k);
    let best = cands[lo];
    for (let i = lo; i < hi; i++) if (photoScore(cands[i]) > photoScore(best)) best = cands[i];
    out.push(best);
  }
  return out;
}

/** n장 고르기 → 선택된 id 집합 */
export function choosePhotos(photos, n) {
  const keep = new Set(photos.filter(isMust).map((p) => p.id));
  if (n >= photos.length) return new Set(photos.map((p) => p.id));
  const groups = structure(photos);
  let free = Math.max(0, n - keep.size);
  // 폴더별 몫: (연사 묶음 수)^0.7 비례, 가능하면 폴더마다 최소 1장
  const avail = groups.map((g) => g.clusters.filter((c) => !c.some((p) => keep.has(p.id))).length);
  const w = avail.map((a) => (a ? Math.pow(a, 0.7) : 0));
  const quota = avail.map(() => 0);
  const active = avail.filter((a) => a > 0).length;
  if (free >= active) avail.forEach((a, i) => a && (quota[i] = 1));
  let rest = free - quota.reduce((s, q) => s + q, 0);
  for (let guard = 0; rest > 0 && guard < 50; guard++) {
    const open = avail.map((a, i) => (quota[i] < a ? i : -1)).filter((i) => i >= 0);
    if (!open.length) break;
    const W = open.reduce((s, i) => s + w[i], 0);
    const share = open.map((i) => ({ i, x: (rest * w[i]) / W }));
    let used = 0;
    for (const s of share) {
      const add = Math.min(Math.floor(s.x), avail[s.i] - quota[s.i]);
      quota[s.i] += add;
      used += add;
    }
    // 남은 자리는 소수점이 큰 순서로
    share.sort((a, b) => (b.x % 1) - (a.x % 1));
    for (const s of share) {
      if (used >= rest) break;
      if (quota[s.i] < avail[s.i]) {
        quota[s.i]++;
        used++;
      }
    }
    rest -= used;
    if (!used) break;
  }
  groups.forEach((g, gi) => {
    const reps = g.clusters.filter((c) => !c.some((p) => keep.has(p.id))).map((c) => c[0]);
    for (const p of pickSpread(reps, quota[gi])) keep.add(p.id);
  });
  // 그래도 자리가 남으면(사진이 대부분 연사) 연사 중 점수 높은 사진으로 채움
  if (keep.size < n) {
    const extra = photos.filter((p) => !keep.has(p.id)).sort((a, b) => photoScore(b) - photoScore(a));
    for (const p of extra) {
      if (keep.size >= n) break;
      keep.add(p.id);
    }
  }
  return keep;
}

const applyKeep = (project, keep) => ({ ...project, items: project.items.map((i) => (i.type === 'photo' ? { ...i, skip: keep.has(i.id) ? undefined : true } : i)) });

/**
 * 목표 길이(target초)에서 사진 1장당 약 perPhoto초가 되도록 몇 장을 쓸지 정하고 고른다.
 * 반환: { keep:Set, count, total(사진 수), photoDuration(예상), project(적용 결과) }
 */
export function planSelection(project, target, perPhoto = 3) {
  const photos = project.items.filter((i) => i.type === 'photo');
  const base = { ...project, style: { ...project.style, lengthMode: 'total', targetDuration: target } };
  const pdFor = (keep) => buildTimeline(applyKeep(base, keep)).photoDuration;
  const must = photos.filter(isMust).length;
  let lo = Math.max(1, Math.min(photos.length, must));
  let hi = photos.length;
  if (pdFor(choosePhotos(photos, hi)) >= perPhoto) lo = hi;
  else {
    // 사진 1장당 시간이 perPhoto 이상이 되는 가장 많은 장수 (이분 탐색)
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (pdFor(choosePhotos(photos, mid)) >= perPhoto) lo = mid;
      else hi = mid - 1;
    }
  }
  const keep = choosePhotos(photos, lo);
  const applied = applyKeep(base, keep);
  return { keep, count: keep.size, total: photos.length, photoDuration: buildTimeline(applied).photoDuration, project: applied };
}

export function clearSelection(project) {
  return { ...project, items: project.items.map((i) => (i.skip ? { ...i, skip: undefined } : i)) };
}
