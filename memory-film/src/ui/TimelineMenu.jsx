// 타임라인(필름스트립) 우클릭 메뉴: 몽타주 만들기·풀기, 사진 추가(앞/뒤 · 파일/폴더), 챕터, 영상에서 빼기, 삭제
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MONTAGE_STYLES } from '../engine/presets.js';
import { checkMontageSelection } from '../engine/edit.js';
import { isDesktop } from '../platform.js';

export function TimelineMenu({ x, y, project, tl, selected, onAction, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y, flip: false });
  const [sub, setSub] = useState(null);
  const ids = [...selected].filter((id) => project.items.some((i) => i.id === id));
  const items = project.items.filter((i) => ids.includes(i.id));
  const photos = items.filter((i) => i.type === 'photo');
  const first = project.items.find((i) => ids.includes(i.id));
  const lastIdx = Math.max(...ids.map((id) => project.items.findIndex((i) => i.id === id)));
  const firstIdx = project.items.indexOf(first);
  const chk = checkMontageSelection(project.items, ids);
  const inMontage = ids.some((id) => tl.byItem?.get(id)?.type === 'group');
  const allSkipped = photos.length > 0 && photos.every((p) => p.skip);

  // 화면 밖으로 나가지 않게 위치 조정
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - r.width - 8);
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    setPos({ left, top, flip: left + r.width + 220 > window.innerWidth });
  }, [x, y]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onDown = (e) => !ref.current?.contains(e.target) && onClose();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const act = (type, payload) => {
    onClose();
    onAction(type, { ids, ...payload });
  };
  const Item = ({ label, hint, onClick, disabled, danger, children, id }) => (
    <div className={'tm-item' + (disabled ? ' disabled' : '') + (danger ? ' danger' : '') + (children ? ' has-sub' : '')} onMouseEnter={() => setSub(children ? id : null)} onClick={() => !disabled && !children && onClick?.()} title={disabled ? hint : undefined} role="menuitem" aria-disabled={disabled}>
      <span>{label}</span>
      {children && !disabled && <span className="tm-arrow">▸</span>}
      {children && !disabled && sub === id && <div className={'tm-sub' + (pos.flip ? ' flip' : '')}>{children}</div>}
    </div>
  );
  const n = chk.photos.length;
  const groupsNote = n > 8 ? ` (${Math.ceil(n / 8)}개로 나눔)` : '';

  return (
    <div ref={ref} className="timeline-menu" style={{ left: pos.left, top: pos.top }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      <div className="tm-head">{ids.length > 1 ? `${ids.length}개 선택됨` : first?.type === 'chapter' ? '챕터 카드' : first?.name || '사진'}</div>
      <Item id="mont" label={`몽타주로 만들기${chk.ok ? ` · ${n}장${groupsNote}` : ''}`} disabled={!chk.ok} hint={chk.reason}>
        <div className="tm-item" onClick={() => act('montage', { style: 'auto' })}>
          <span>자동 (장수에 어울리는 효과)</span>
        </div>
        {Object.entries(MONTAGE_STYLES).map(([id, m]) => (
          <div key={id} className="tm-item" onClick={() => act('montage', { style: id })}>
            <span>{m.name}</span>
          </div>
        ))}
      </Item>
      {inMontage && <Item label="몽타주 해제 (한 장씩 보이기)" onClick={() => act('release')} />}
      <div className="tm-sep" />
      <Item id="addBefore" label={first?.type === 'chapter' ? '이 챕터 앞에 사진 추가' : '이 사진 앞에 사진 추가'} disabled={!isDesktop} hint="PC 버전에서 사용할 수 있습니다">
        <div className="tm-item" onClick={() => act('add', { index: firstIdx, kind: 'files' })}>
          <span>사진 파일 선택…</span>
        </div>
        <div className="tm-item" onClick={() => act('add', { index: firstIdx, kind: 'folder' })}>
          <span>폴더 선택…</span>
        </div>
      </Item>
      <Item id="addAfter" label={first?.type === 'chapter' ? '이 챕터 뒤에 사진 추가' : '이 사진 뒤에 사진 추가'} disabled={!isDesktop} hint="PC 버전에서 사용할 수 있습니다">
        <div className="tm-item" onClick={() => act('add', { index: lastIdx + 1, kind: 'files' })}>
          <span>사진 파일 선택…</span>
        </div>
        <div className="tm-item" onClick={() => act('add', { index: lastIdx + 1, kind: 'folder' })}>
          <span>폴더 선택…</span>
        </div>
      </Item>
      <Item label="앞에 챕터 카드 넣기" onClick={() => act('chapter', { before: first?.id })} />
      <div className="tm-sep" />
      {photos.length > 0 &&
        (allSkipped ? (
          <Item label={`영상에 다시 넣기 (${photos.length}장)`} onClick={() => act('skip', { value: false })} />
        ) : (
          <Item label={`영상에서 빼기 (${photos.length}장, 흐리게 남음)`} onClick={() => act('skip', { value: true })} />
        ))}
      <Item danger label={`프로젝트에서 삭제 (${ids.length}개)`} onClick={() => act('delete')} />
      <div className="tm-foot">사진 원본 파일은 지워지지 않습니다 · Ctrl+Z로 되돌리기</div>
    </div>
  );
}
