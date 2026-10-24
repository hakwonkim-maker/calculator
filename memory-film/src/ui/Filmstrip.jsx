// 하단 필름스트립: 순서 편집(드래그), 선택, 전환 효과 지정
import React, { memo, useEffect, useRef, useState } from 'react';
import { uiThumb } from '../engine/assets.js';
import { TRANSITIONS } from '../engine/transitions.js';
import { photoMeta, setPhotoMeta, useMetaVersion } from './store.js';
import { LOW_RES_PX } from './logic.js';
import { Icon } from './controls.jsx';

export function Thumb({ path, className, rotate = 0 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    uiThumb(path, 240, rotate).then((r) => {
      if (!alive) return;
      if (r.url) {
        setSrc(r.url);
        // 메타 정보는 원본 기준 (회전 전)
        const swap = rotate === 90 || rotate === 270;
        setPhotoMeta(path, { w: swap ? r.h : r.w, h: swap ? r.w : r.h, error: false });
      } else setPhotoMeta(path, { error: true });
    });
    return () => {
      alive = false;
    };
  }, [path, rotate]);
  return src ? <img className={className} src={src} alt="" draggable={false} /> : <div className={className + ' thumb-loading'} />;
}

const Card = memo(function Card({ item, index, selected, active, onSelect, onDragStart, metaV }) {
  void metaV;
  const meta = item.type === 'photo' ? photoMeta.get(item.path) : null;
  const low = meta && meta.w && Math.max(meta.w, meta.h) < LOW_RES_PX;
  const bad = meta && (meta.missing || meta.error);
  return (
    <div
      className={'card' + (selected ? ' selected' : '') + (active ? ' active' : '') + (item.type === 'chapter' ? ' chapter' : '')}
      draggable
      onDragStart={(e) => onDragStart(e, item.id)}
      onMouseDown={(e) => {
        // 이미 선택된 카드를 누르면 다중 선택을 유지한 채 드래그할 수 있도록 클릭 때 단일 선택
        if (!selected || e.shiftKey || e.ctrlKey || e.metaKey) onSelect(item.id, e);
      }}
      onClick={(e) => {
        if (selected && !e.shiftKey && !e.ctrlKey && !e.metaKey) onSelect(item.id, e);
      }}
      title={item.name || item.title}
    >
      {item.type === 'photo' ? (
        <Thumb path={item.path} rotate={Number(item.rotate) || 0} className="card-img" />
      ) : (
        <div className="card-chapter">
          <b>{item.title || '챕터'}</b>
          <span>{item.subtitle}</span>
        </div>
      )}
      <span className="card-idx">{index}</span>
      {low && <span className="badge warn" title={`원본 ${meta.w}×${meta.h}px`}>저해상도</span>}
      {bad && <span className="badge err">{meta.missing ? '파일 없음' : '열 수 없음'}</span>}
      {item.motion && item.motion !== 'auto' && <span className="card-flag" title="개별 카메라 움직임">◎</span>}
      {(item.label || item.caption) && <span className="card-cap">{[item.label, item.caption].filter(Boolean).join(' · ')}</span>}
    </div>
  );
});

function TransitionChip({ seg, item, onPick, onPickAll, open, setOpen }) {
  const resolved = seg?.transIn;
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(window.innerWidth - 448, r.left + r.width / 2 - 220)), top: r.top - 6 });
  }, [open]);
  const isAuto = !item?.transition || item.transition === 'auto';
  return (
    <div className="tchip-wrap">
      <button ref={btnRef} className={'tchip' + (isAuto ? '' : ' manual') + (open ? ' open' : '')} onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen(open ? null : item?.id || 'intro')} title="전환 효과 변경">
        <span className="tchip-dia" />
        <span className="tchip-name">{resolved ? TRANSITIONS[resolved]?.name : '—'}</span>
      </button>
      {open && (
        <div className="tmenu" style={pos || { visibility: 'hidden' }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="tmenu-head">
            <span>누르면 바로 적용되고 미리보기로 재생됩니다</span>
          </div>
          <div className="tmenu-grid">
            <button className={isAuto ? 'on' : ''} onClick={() => onPick('auto')}>
              <b>자동</b>
              <small>스타일에 맞게</small>
            </button>
            {Object.entries(TRANSITIONS).map(([id, t]) => (
              <button key={id} className={!isAuto && item?.transition === id ? 'on' : ''} onClick={() => onPick(id)} title={t.desc}>
                <b>{t.name}</b>
                <small>{t.desc}</small>
              </button>
            ))}
          </div>
          {!isAuto && (
            <button className="tmenu-all" onClick={() => onPickAll(item.transition)}>
              ‘{TRANSITIONS[item.transition]?.name}’ 를 모든 장면 전환에 적용
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Filmstrip({ project, tl, selected, activeKey, onSelect, onReorder, onSetTransition, onSetAllTransitions, onSelectSpecial, onDropFiles, onAddPhotos }) {
  const metaV = useMetaVersion();
  const [dragId, setDragId] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const [menu, setMenu] = useState(null);
  const scrollRef = useRef(null);
  const segByKey = new Map(tl.segments.map((s) => [s.key, s]));

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  // 선택 항목이 화면에 보이도록 스크롤
  useEffect(() => {
    const el = scrollRef.current?.querySelector('.card.selected');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-memoria', id);
  };
  const onDragOver = (e) => {
    const internal = e.dataTransfer.types.includes('text/x-memoria');
    const files = e.dataTransfer.types.includes('Files');
    if (!internal && !files) return;
    e.preventDefault();
    e.stopPropagation();
    const cards = [...scrollRef.current.querySelectorAll('.card-slot[data-idx]')];
    let idx = cards.length;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (e.clientX < r.left + r.width / 2) {
        idx = Number(c.dataset.idx);
        break;
      }
    }
    setDropIdx(idx);
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/x-memoria');
    if (id && dropIdx != null) onReorder(id, dropIdx);
    else if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files, dropIdx);
    setDragId(null);
    setDropIdx(null);
  };

  const items = project.items;
  let photoNo = 0;
  const introSeg = segByKey.get('intro');
  return (
    <div className="filmstrip" ref={scrollRef} onDragOver={onDragOver} onDrop={onDrop} onDragLeave={(e) => e.currentTarget === e.target && setDropIdx(null)} onDragEnd={() => { setDragId(null); setDropIdx(null); }}>
      {project.intro.enabled && (
        <>
          <div className={'card special' + (selected.has('intro') ? ' selected' : '') + (activeKey === 'intro' ? ' active' : '')} onMouseDown={() => onSelectSpecial('intro')}>
            <div className="card-special">
              <Icon name="sparkle" size={18} />
              <b>인트로</b>
              <span>{(introSeg?.dur || 0).toFixed(0)}초</span>
            </div>
          </div>
          {items.length > 0 && (
            <TransitionChip
              seg={segByKey.get(items[0].id)}
              item={{ id: '__intro', transition: project.intro.transition }}
              open={menu === '__intro'}
              setOpen={setMenu}
              onPick={(t) => {
                onSetTransition('__intro', t);
                setMenu(null);
              }}
              onPickAll={(t) => {
                onSetAllTransitions(t);
                setMenu(null);
              }}
            />
          )}
        </>
      )}
      {items.map((it, i) => {
        if (it.type === 'photo') photoNo++;
        const next = items[i + 1];
        const nextSeg = next ? segByKey.get(next.id) : project.outro.enabled ? segByKey.get('outro') : null;
        return (
          <React.Fragment key={it.id}>
            {dropIdx === i && <div className="drop-marker" />}
            <div data-idx={i} className={'card-slot' + (dragId === it.id ? ' dragging' : '')} >
              <Card item={it} index={it.type === 'photo' ? photoNo : '§'} selected={selected.has(it.id)} active={activeKey === it.id} onSelect={onSelect} onDragStart={onDragStart} metaV={metaV} />
            </div>
            {nextSeg && (
              <TransitionChip
                seg={nextSeg}
                item={it}
                open={menu === it.id}
                setOpen={setMenu}
                onPick={(t) => {
                  onSetTransition(it.id, t);
                  setMenu(null);
                }}
                onPickAll={(t) => {
                  onSetAllTransitions(t);
                  setMenu(null);
                }}
              />
            )}
          </React.Fragment>
        );
      })}
      {dropIdx === items.length && <div className="drop-marker" />}
      <button className="card add" onClick={onAddPhotos} title="사진 추가">
        <Icon name="plus" size={22} />
        <span>사진 추가</span>
      </button>
      {project.outro.enabled && (
        <div className={'card special' + (selected.has('outro') ? ' selected' : '') + (activeKey === 'outro' ? ' active' : '')} onMouseDown={() => onSelectSpecial('outro')}>
          <div className="card-special">
            <Icon name="film" size={18} />
            <b>엔딩</b>
            <span>{(segByKey.get('outro')?.dur || 0).toFixed(0)}초</span>
          </div>
        </div>
      )}
    </div>
  );
}
