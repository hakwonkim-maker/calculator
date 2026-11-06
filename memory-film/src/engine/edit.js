// 타임라인 우클릭 편집: 직접 몽타주 만들기·풀기 (순수 함수 — 테스트 가능)
import { newId } from './presets.js';

export const MANUAL_MIN = 2;
export const MANUAL_MAX = 8;

/**
 * 선택한 사진들로 몽타주를 만들 수 있는지 검사
 * - 사진 2장 이상 (영상에서 뺀 사진은 셈에서 제외)
 * - 붙어 있어야 함: 첫 사진~마지막 사진 사이에 선택하지 않은 사진·챕터 카드가 없어야 (뺀 사진은 괜찮음)
 * 반환: { ok, reason?, photos: [아이템] }
 */
export function checkMontageSelection(items, ids) {
  const set = new Set(ids);
  const idx = items.map((it, k) => (set.has(it.id) ? k : -1)).filter((k) => k >= 0);
  if (!idx.length) return { ok: false, reason: '사진을 먼저 선택하세요.', photos: [] };
  if (idx.some((k) => items[k].type !== 'photo')) return { ok: false, reason: '챕터 카드는 몽타주에 넣을 수 없습니다.', photos: [] };
  const lo = Math.min(...idx);
  const hi = Math.max(...idx);
  for (let k = lo; k <= hi; k++) {
    const it = items[k];
    if (set.has(it.id) || (it.type === 'photo' && it.skip)) continue;
    return { ok: false, reason: it.type === 'chapter' ? '사이에 챕터 카드가 있어 몽타주로 만들 수 없습니다.' : '붙어 있는 사진만 몽타주로 만들 수 있습니다. (사이에 선택하지 않은 사진이 있음)', photos: [] };
  }
  const photos = items.slice(lo, hi + 1).filter((it) => set.has(it.id) && !it.skip);
  if (photos.length < MANUAL_MIN) return { ok: false, reason: '영상에 쓰이는 사진을 2장 이상 선택하세요.', photos };
  return { ok: true, photos };
}

/** n장을 MANUAL_MAX 이하 묶음으로 고르게 나눔 (예: 9 → 5+4, 17 → 6+6+5) */
export function splitEven(n, max = MANUAL_MAX) {
  const k = Math.ceil(n / max);
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * 직접 몽타주 만들기. style: 'auto' | 'grid' | 'polaroid' | 'split' | 'filmstrip'
 * 반환: { project, groups(묶음 수), count(장수), captioned(자막 있어 몽타주에선 안 보이는 장수) } | { error }
 */
export function makeManualMontage(project, ids, style = 'auto') {
  const chk = checkMontageSelection(project.items, ids);
  if (!chk.ok) return { error: chk.reason };
  const sizes = splitEven(chk.photos.length);
  const assign = new Map();
  let k = 0;
  for (const size of sizes) {
    const mg = newId('mg');
    for (let j = 0; j < size; j++, k++) assign.set(chk.photos[k].id, mg);
  }
  const items = project.items.map((it) => {
    if (!assign.has(it.id)) return it;
    // 자동 몽타주 지정(montage)은 이 사진들엔 더 이상 의미가 없으므로 정리
    // 사진별 장면 레이아웃도 몽타주 안에서는 쓰이지 않으므로 정리 (풀면 연출 스타일이 다시 고름)
    const { montage, layout, ...rest } = it;
    return { ...rest, mg: assign.get(it.id), mgStyle: style === 'auto' ? undefined : style };
  });
  return {
    project: { ...project, items },
    groups: sizes.length,
    count: chk.photos.length,
    captioned: chk.photos.filter((p) => (p.caption && p.caption.trim()) || (p.label && p.label.trim())).length,
  };
}

/**
 * 몽타주 풀기: 선택한 사진이 속한 몽타주를 한 장씩 보이게
 * - 직접 만든 몽타주 → 묶음 해제 (mg 제거)
 * - 자동 몽타주 → 그 자리 몽타주 끄기 (첫 사진에 montage: 'off')
 * 반환: { project, released(풀린 몽타주 수) }
 */
export function releaseMontages(project, tl, ids) {
  const groups = new Map();
  for (const id of ids) {
    const seg = tl.byItem?.get(id);
    if (seg?.type === 'group') groups.set(seg.key, seg);
  }
  if (!groups.size) return { project, released: 0 };
  const manualIds = new Set();
  const autoFirst = new Set();
  for (const g of groups.values()) {
    if (g.manual) manualIds.add(g.mgId);
    else autoFirst.add(g.items[0].id);
  }
  const items = project.items.map((it) => {
    if (it.mg && manualIds.has(it.mg)) {
      const { mg, mgStyle, ...rest } = it;
      return rest;
    }
    if (autoFirst.has(it.id)) return { ...it, montage: 'off' };
    return it;
  });
  return { project: { ...project, items }, released: groups.size };
}
