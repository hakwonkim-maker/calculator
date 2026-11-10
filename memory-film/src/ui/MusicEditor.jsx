// 음악 편집 창: 곡 조각을 레이어 위에 놓고 옮기기 · 자르기 · 나누기 · 붙이기 · 페이드 · 교차 페이드
// 위쪽: 시간 눈금 + 영상 장면 띠 / 아래: 음악 레이어(파형) / 맨 아래: 고른 조각의 숫자 편집
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, Toggle } from './controls.jsx';
import {
  autoClips, toEdit, toAuto, moveClip, trimClip, splitClip, setRange, placeClip, appendTrack, fillToEnd, deleteClips, setFade,
  addLayer, removeLayer, toggleMute, snapTime, clipEnd, silentGaps, MAX_LAYERS,
} from '../engine/musicedit.js';
import { MONTAGE_STYLES } from '../engine/presets.js';
import { baseName } from '../platform.js';

const LANE_H = 62;
const HEAD_W = 104;
const fmt = (t) => {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
const fmtShort = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const TICKS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const LAYER_COLORS = ['#c9a45c', '#7fa8c9', '#a98fc9', '#8fc9a0', '#c98f8f', '#c9c18f'];

/** 편집 결과에서 음악 편집 필드만 반영 (박자 분석 등으로 바뀐 곡 정보는 그대로) */
const mergeMusic = (cur, res) => ({ ...cur, mode: res.mode, clips: res.clips, layers: res.layers, muted: res.muted, endFade: res.endFade, crossfade: res.crossfade });

export function MusicEditor({ project, update, tl, audio, previewRef, actions, toast, onClose, onGoMusic, blocked }) {
  const music = project.music;
  const total = tl.total;
  const edit = music.mode === 'edit';
  // 자동 모드에서는 자동 배치를 그대로 보여 주고, 처음 손대는 순간 직접 편집으로 바꿈
  const view = useMemo(() => (edit ? music : { ...music, clips: autoClips(music, total), layers: 2, muted: [] }), [edit, music, total]);
  const clips = view.clips || [];
  const layers = Math.max(1, view.layers || 2);
  const tracks = music.tracks || [];
  const nameOf = (path) => {
    const t = tracks.find((x) => x.path === path);
    return t?.name || baseName(path || '');
  };
  const [sel, setSel] = useState(null);
  const [cross, setCross] = useState(true);
  const scrollRef = useRef(null);
  const [width, setWidth] = useState(900);
  const span = Math.max(total, clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)) + 20;
  const [pps, setPps] = useState(null); // 1초당 픽셀
  const fitPps = Math.max(2, (width - 40) / Math.max(10, total + 10));
  const P = pps ?? fitPps;
  const contentW = Math.ceil(span * P);
  const clipboard = useRef(null);
  const drag = useRef(null);
  const headRef = useRef(null);
  const timeRef = useRef(null);
  const lanesRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // 재생 위치 (미리보기 시계를 직접 읽어 부드럽게)
  useEffect(() => {
    let raf;
    let lastPlaying = null;
    const loop = () => {
      const t = previewRef.current?.time ?? 0;
      if (headRef.current) headRef.current.style.transform = `translateX(${t * P}px)`;
      if (timeRef.current) timeRef.current.textContent = fmt(t);
      const pl = !!previewRef.current?.playing;
      if (pl !== lastPlaying) {
        lastPlaying = pl;
        setPlaying(pl);
      }
      // 재생 중 재생 위치가 화면 밖으로 나가면 따라감
      const el = scrollRef.current;
      if (pl && el) {
        const x = t * P;
        if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 80);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [P, previewRef]);

  /** 편집 적용: 자동 모드면 먼저 직접 편집으로 바꾼 뒤 (조각 id 를 같은 순서로 대응) */
  const base = useCallback(() => {
    const cur = project.music;
    if (cur.mode === 'edit') return { m: cur, map: (id) => id };
    const m = toEdit(cur, total);
    const autos = autoClips(cur, total);
    return { m, map: (id) => m.clips[autos.findIndex((c) => c.id === id)]?.id ?? id };
  }, [project.music, total]);
  const apply = useCallback(
    (fn, key) => {
      const wasAuto = project.music.mode !== 'edit';
      const { m, map } = base();
      const res = fn(m, map);
      if (!res || res === m) return null; // 바뀐 것이 없으면 자동 배치도 그대로
      update((p) => ({ ...p, music: mergeMusic(p.music, res) }), key);
      if (wasAuto) toast('직접 편집으로 바꿨습니다 · ‘자동으로 되돌리기’로 언제든 원래대로', 'ok');
      return { res, map };
    },
    [base, project.music.mode, toast, update],
  );

  const now = () => previewRef.current?.time ?? 0;
  const seek = (t) => previewRef.current?.seek(Math.max(0, Math.min(total - 0.001, t)));
  const selClip = clips.find((c) => c.id === sel) || null;

  // ------------------------------------------------ 끌기 (옮기기 · 자르기 · 페이드)
  const xToT = (clientX) => {
    const el = scrollRef.current;
    const r = el.getBoundingClientRect();
    return (clientX - r.left + el.scrollLeft) / P;
  };
  const yToLayer = (clientY) => {
    const r = lanesRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(Math.min(MAX_LAYERS - 1, layers), Math.floor((clientY - r.top) / LANE_H)));
  };
  // 숫자 칸에 입력하던 중 타임라인을 누르면 Space·S·Ctrl+Z 등 단축키가 다시 동작하도록 입력 칸에서 빠져나옴
  const releaseFocus = () => {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) a.blur();
  };
  const onClipDown = (e, c, kind) => {
    if (e.button !== 0) return;
    releaseFocus();
    e.stopPropagation();
    e.preventDefault();
    setSel(c.id);
    const { m, map } = base();
    const id = map(c.id);
    const mc = m.clips.find((x) => x.id === id) || c;
    drag.current = { kind, id, m, mc, x0: e.clientX, y0: e.clientY, t0: xToT(e.clientX), moved: false, key: 'mus-drag-' + id + '-' + Date.now(), wasAuto: project.music.mode !== 'edit' };
    window.addEventListener('pointermove', stableMove);
    window.addEventListener('pointerup', stableUp, { once: true });
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3 && Math.abs(e.clientY - d.y0) < 3) return;
    if (!d.moved && d.wasAuto) {
      toast('직접 편집으로 바꿨습니다 · ‘자동으로 되돌리기’로 언제든 원래대로', 'ok');
      setSel(d.id);
    }
    d.moved = true;
    const tol = e.altKey ? 0 : 8 / P;
    const pts = [now(), total];
    const t = xToT(e.clientX);
    const c = d.mc;
    const L = c.out - c.in;
    let res;
    if (d.kind === 'body') {
      let s = c.start + (t - d.t0);
      const s1 = snapTime(d.m, c.id, s, pts, tol);
      const e1 = snapTime(d.m, c.id, s + L, pts, tol) - L;
      s = Math.abs(s1 - s) <= Math.abs(e1 - s) ? s1 : e1;
      res = moveClip(d.m, c.id, s, yToLayer(e.clientY), { cross });
    } else if (d.kind === 'in' || d.kind === 'out') res = trimClip(d.m, c.id, d.kind, snapTime(d.m, c.id, t, pts, tol), { cross });
    else if (d.kind === 'fadeIn') res = setFade(d.m, c.id, 'fadeIn', t - c.start);
    else if (d.kind === 'fadeOut') res = setFade(d.m, c.id, 'fadeOut', c.start + L - t);
    if (res && res !== d.m) update((p) => ({ ...p, music: mergeMusic(p.music, res) }), d.key);
  };
  // 끄는 동안 다시 그려져도 같은 리스너를 쓰도록 (최신 onMove 를 ref 로 호출)
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const stableMove = useCallback((e) => moveRef.current(e), []);
  const stableUp = useCallback(() => {
    window.removeEventListener('pointermove', stableMove);
    drag.current = null;
  }, [stableMove]);
  useEffect(() => () => window.removeEventListener('pointermove', stableMove), [stableMove]);

  // 빈 곳·눈금 클릭 → 그 시각으로 이동 (끌면 계속 이동)
  const onSeekDown = (e) => {
    if (e.button !== 0) return;
    releaseFocus();
    setSel(null);
    seek(xToT(e.clientX));
    const mv = (ev) => seek(xToT(ev.clientX));
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
  };

  // ------------------------------------------------ 버튼 동작
  const split = () => {
    const t = now();
    const target = selClip && t > selClip.start && t < clipEnd(selClip) ? selClip : clips.find((c) => t > c.start + 0.1 && t < clipEnd(c) - 0.1);
    if (!target) return toast('재생 위치(세로선)가 조각 위에 있을 때 나눌 수 있습니다', 'warn');
    const r = apply((m, map) => splitClip(m, map(target.id), t));
    // 뒤쪽 조각을 고른 상태로
    if (r) setSel(r.res.clips[r.res.clips.findIndex((c) => c.id === r.map(target.id)) + 1]?.id ?? null);
  };
  const del = () => {
    if (!selClip) return;
    apply((m, map) => deleteClips(m, [map(selClip.id)]));
    setSel(null);
  };
  const copy = () => {
    if (!selClip) return;
    clipboard.current = { ...selClip };
    toast(`‘${nameOf(selClip.path)}’ 조각을 복사했습니다 · Ctrl+V 로 재생 위치에 붙여넣기`);
  };
  const paste = () => {
    const c = clipboard.current;
    if (!c) return toast('먼저 조각을 고르고 복사(Ctrl+C)하세요', 'warn');
    const r = apply((m) => placeClip(m, c, now(), c.layer));
    if (r) setSel(r.res.clips[r.res.clips.length - 1]?.id);
  };
  const duplicate = () => {
    if (!selClip) return;
    const r = apply((m) => placeClip(m, selClip, clipEnd(selClip), selClip.layer));
    if (r) setSel(r.res.clips[r.res.clips.length - 1]?.id);
  };
  const fill = () => {
    if (!clips.length) return toast('먼저 곡을 넣어 주세요', 'warn');
    const r = apply((m) => fillToEnd(m, total, Number(music.crossfade) || 3));
    if (r) toast('마지막 조각을 이어 붙여 영상 끝까지 채웠습니다');
  };
  const backToAuto = () => {
    update((p) => ({ ...p, music: toAuto(p.music) }));
    setSel(null);
    toast('음악을 자동 배치로 되돌렸습니다 (Ctrl+Z로 직접 편집 복구)');
  };
  const insertTrack = (t) => apply((m) => appendTrack(m, t, Number(music.crossfade) || 3));
  const zoom = (k) => {
    const el = scrollRef.current;
    const center = el ? (el.scrollLeft + el.clientWidth / 2) / P : 0;
    const np = Math.max(1, Math.min(400, P * k));
    setPps(np);
    requestAnimationFrame(() => {
      if (el) el.scrollLeft = Math.max(0, center * np - el.clientWidth / 2);
    });
  };

  // ------------------------------------------------ 단축키 (음악 편집 창이 열려 있는 동안)
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (blocked || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; // 다른 창(내보내기·도움말 등)이 떠 있으면 그 창이 처리
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      let done = true;
      if (!mod && k === 's') split();
      else if (e.key === 'Delete' || e.key === 'Backspace') del();
      else if (mod && k === 'c') copy();
      else if (mod && k === 'v') paste();
      else if (mod && k === 'd') duplicate();
      else if (e.key === 'Escape') sel ? setSel(null) : onClose();
      else done = false;
      if (done) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // ------------------------------------------------ 곡 목록에서 끌어 놓기
  const onLaneDrop = (e) => {
    const path = e.dataTransfer.getData('text/mf-track');
    if (!path) return;
    e.preventDefault();
    const t = tracks.find((x) => x.path === path);
    if (!t?.duration) return;
    const at = Math.max(0, xToT(e.clientX));
    const r = apply((m) => placeClip(m, { path, in: 0, out: t.duration, fadeIn: 0, fadeOut: 0, layer: 0 }, at, yToLayer(e.clientY)));
    if (r) setSel(r.res.clips[r.res.clips.length - 1]?.id);
  };

  // 눈금 간격
  const step = TICKS.find((s) => s * P >= 64) || 300;
  const ticks = [];
  for (let t = 0; t <= span; t += step) ticks.push(t);
  const gaps = edit ? silentGaps(music, total) : [];
  const showLayers = Math.min(MAX_LAYERS, layers);

  return (
    <section className="music-editor" aria-label="음악 편집">
      <div className="me-toolbar">
        <b className="me-title">
          <Icon name="music" size={16} /> 음악 편집
        </b>
        <span className={'me-mode' + (edit ? ' edit' : '')}>{edit ? '직접 편집' : '자동 배치'}</span>
        <button className="tbtn play" onClick={() => previewRef.current?.toggle()} title="재생/일시정지 (Space)">
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <span className="me-time" ref={timeRef}>
          0:00.0
        </span>
        <span className="me-sep" />
        <Button icon="cut" size="sm" onClick={split} title="재생 위치에서 조각 나누기 (S)">
          나누기
        </Button>
        <Button icon="copy" size="sm" onClick={copy} disabled={!selClip} title="복사 (Ctrl+C)" />
        <Button icon="paste" size="sm" onClick={paste} title="재생 위치에 붙여넣기 (Ctrl+V)" />
        <Button icon="plus" size="sm" onClick={duplicate} disabled={!selClip} title="바로 뒤에 복제 (Ctrl+D)" />
        <Button icon="trash" size="sm" onClick={del} disabled={!selClip} title="삭제 (Delete)" />
        <span className="me-sep" />
        <Button icon="fill" size="sm" variant="soft" onClick={fill} title="마지막 조각을 교차 페이드로 이어 붙여 영상 끝까지 채우기">
          영상 길이 채우기
        </Button>
        <label className="me-xf" title="곡을 이어 붙이거나 채울 때 겹치는 길이 (자동 배치의 ‘곡 사이 크로스페이드’와 같은 값)">
          교차
          <select value={music.crossfade} onChange={(e) => update((p) => ({ ...p, music: { ...p.music, crossfade: Number(e.target.value) } }))}>
            {[0, 1, 2, 3, 4, 5, 6, 8].map((v) => (
              <option key={v} value={v}>
                {v}초
              </option>
            ))}
          </select>
        </label>
        <label className="me-chk" title="다른 레이어의 조각과 겹치게 놓으면 겹친 길이만큼 자동으로 교차 페이드">
          <input type="checkbox" checked={cross} onChange={(e) => setCross(e.target.checked)} /> 겹치면 자동 교차
        </label>
        <span className="me-grow" />
        <button className="icon-btn" onClick={() => zoom(1 / 1.5)} title="축소 (Ctrl+휠)">
          <Icon name="zoomOut" size={16} />
        </button>
        <button className="icon-btn" onClick={() => zoom(1.5)} title="확대 (Ctrl+휠)">
          <Icon name="zoomIn" size={16} />
        </button>
        <button className="link small" onClick={() => setPps(null)}>
          전체 보기
        </button>
        {edit && (
          <Button size="sm" onClick={backToAuto} title="곡 목록 순서대로 자동으로 이어 붙이는 방식으로">
            자동으로 되돌리기
          </Button>
        )}
        <Button icon="x" size="sm" onClick={onClose} title="닫기 (Esc)" />
      </div>

      <div className="me-body">
        <aside className="me-sources">
          <div className="me-src-head">곡 목록</div>
          {tracks.map((t) => (
            <div key={t.path} className="me-src" draggable={!!t.duration} onDragStart={(e) => e.dataTransfer.setData('text/mf-track', t.path)} title="레이어로 끌어다 놓거나 ‘넣기’로 맨 끝에 이어 붙이기">
              <Icon name="music" size={13} />
              <span>
                <b>{t.name || baseName(t.path)}</b>
                <small>{t.duration ? fmtShort(t.duration) : '분석 중…'}</small>
              </span>
              <button className="chip" disabled={!t.duration} onClick={() => insertTrack(t)}>
                넣기
              </button>
            </div>
          ))}
          <Button icon="plus" size="sm" variant="soft" onClick={actions.addMusic}>
            내 음악 파일
          </Button>
          <button className="link small" onClick={onGoMusic}>
            무료 음악 고르기 →
          </button>
        </aside>

        <div className="me-main">
          <div className="me-heads">
            <div className="me-head-ruler">시간</div>
            <div className="me-head-scenes">영상 장면</div>
            {Array.from({ length: showLayers }, (_, L) => {
              const muted = (view.muted || []).includes(L);
              const empty = !clips.some((c) => c.layer === L);
              return (
                <div key={L} className="me-head-lane" style={{ height: LANE_H, '--lc': LAYER_COLORS[L % 6] }}>
                  <span>레이어 {L + 1}</span>
                  <button className={'icon-btn' + (muted ? ' on' : '')} onClick={() => apply((m) => toggleMute(m, L))} title={muted ? '소리 켜기' : '이 레이어 소리 끄기 (들어 보며 비교)'}>
                    <Icon name={muted ? 'mute' : 'volume'} size={14} />
                  </button>
                  {empty && layers > 1 && (
                    <button className="icon-btn" onClick={() => apply((m) => removeLayer(m, L))} title="빈 레이어 지우기">
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            {layers < MAX_LAYERS && (
              <button className="me-add-layer" onClick={() => apply((m) => addLayer(m))}>
                + 레이어 추가
              </button>
            )}
          </div>

          <div
            className="me-scroll"
            ref={scrollRef}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2);
              }
            }}
          >
            <div className="me-canvas" style={{ width: contentW }}>
              <div className="me-ruler" onPointerDown={onSeekDown}>
                {ticks.map((t) => (
                  <span key={t} className="me-tick" style={{ left: t * P }}>
                    {fmtShort(t)}
                  </span>
                ))}
              </div>
              <div className="me-scenes" onPointerDown={onSeekDown}>
                {tl.segments.map((s) => {
                  const w = Math.max(1, (s.dur - s.tOut) * P);
                  const label =
                    s.type === 'intro' ? '인트로' : s.type === 'outro' ? '엔딩' : s.type === 'chapter' ? s.item?.title || '챕터' : s.type === 'group' ? MONTAGE_STYLES[s.style]?.name : '';
                  return (
                    <div key={s.key} className={'me-scene ' + s.type} style={{ left: s.start * P, width: w }} title={label || '사진'}>
                      {w > 34 && label ? label : ''}
                    </div>
                  );
                })}
              </div>
              <div className="me-lanes" ref={lanesRef} onPointerDown={onSeekDown} onDragOver={(e) => e.dataTransfer.types.includes('text/mf-track') && e.preventDefault()} onDrop={onLaneDrop}>
                {Array.from({ length: showLayers }, (_, L) => (
                  <div key={L} className={'me-lane' + ((view.muted || []).includes(L) ? ' muted' : '')} style={{ top: L * LANE_H, height: LANE_H }} />
                ))}
                {gaps.map(([a, b]) => (
                  <div key={a} className="me-gap" style={{ left: a * P, width: (b - a) * P, height: showLayers * LANE_H }} title={`음악 없음 ${fmt(a)}~${fmt(b)}`} />
                ))}
                {clips.map((c) => (
                  <Clip
                    key={c.id}
                    c={c}
                    P={P}
                    name={nameOf(c.path)}
                    audio={audio}
                    sel={c.id === sel}
                    muted={(view.muted || []).includes(c.layer)}
                    auto={!edit}
                    onDown={onClipDown}
                  />
                ))}
                <div className="me-lanes-pad" style={{ height: showLayers * LANE_H }} />
              </div>
              <div className="me-end" style={{ left: total * P }} title="영상 끝 — 이후 음악은 들리지 않습니다">
                <span>영상 끝 {fmtShort(total)}</span>
              </div>
              <div className="me-playhead" ref={headRef} />
            </div>
          </div>
        </div>
      </div>

      <div className="me-foot">
        {!tracks.length ? (
          <span className="hint">곡이 없습니다. 왼쪽 ‘내 음악 파일’ 또는 ‘무료 음악 고르기’로 곡을 넣으세요.</span>
        ) : selClip ? (
          <ClipForm
            c={selClip}
            name={nameOf(selClip.path)}
            dur={tracks.find((t) => t.path === selClip.path)?.duration}
            apply={(fn, key) => {
              const r = apply(fn, key);
              if (r) setSel(r.map(selClip.id)); // 자동 → 직접 편집으로 바뀌어도 같은 조각을 계속 고른 상태로
              return r;
            }}
          />
        ) : (
          <span className="hint">
            {edit
              ? '조각을 끌어 옮기고(위아래로 레이어 이동), 양 끝을 끌어 자르고, 위쪽 모서리의 동그라미를 끌어 페이드를 조절하세요. 다른 레이어와 겹치면 교차 페이드가 됩니다. Alt를 누르고 끌면 달라붙지 않습니다.'
              : '지금은 곡 목록 순서대로 자동 배치된 모습입니다. 조각을 움직이거나 자르면 직접 편집으로 바뀝니다.'}
          </span>
        )}
        <span className="me-grow" />
        {edit && (
          <Toggle
            checked={music.endFade !== false}
            onChange={(v) => update((p) => ({ ...p, music: { ...p.music, endFade: v } }))}
            label={`영상 끝에서 페이드아웃 ${Number(music.fadeOut) || 0}초`}
          />
        )}
      </div>
    </section>
  );
}

/** 조각 하나: 파형 + 페이드 모양 + 자르기·페이드 손잡이 */
function Clip({ c, P, name, audio, sel, muted, auto, onDown }) {
  const L = c.out - c.in;
  const w = Math.max(6, L * P);
  const canvasRef = useRef(null);
  const h = LANE_H - 10;
  useEffect(() => {
    let alive = true;
    audio
      .peaks(c.path)
      .then((pk) => {
        const cv = canvasRef.current;
        if (!alive || !cv) return;
        const cw = Math.min(4096, Math.max(1, Math.round(w)));
        cv.width = cw;
        cv.height = h;
        const g = cv.getContext('2d');
        g.clearRect(0, 0, cw, h);
        g.fillStyle = 'rgba(255,255,255,0.55)';
        const per = (L * 100) / cw;
        for (let x = 0; x < cw; x++) {
          const a = Math.floor(c.in * 100 + x * per);
          const b = Math.max(a + 1, Math.floor(c.in * 100 + (x + 1) * per));
          let m = 0;
          for (let k = a; k < b && k < pk.length; k++) if (pk[k] > m) m = pk[k];
          const bh = Math.max(1, m * (h - 16));
          g.fillRect(x, (h - bh) / 2 + 6, 1, bh);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [c.path, c.in, c.out, w, h, L, audio]);
  const fi = Math.min(w, (c.fadeIn || 0) * P);
  const fo = Math.min(w, (c.fadeOut || 0) * P);
  return (
    <div
      className={'me-clip' + (sel ? ' sel' : '') + (muted ? ' muted' : '') + (auto ? ' auto' : '')}
      style={{ left: c.start * P, top: c.layer * LANE_H + 5, width: w, height: h, '--lc': LAYER_COLORS[c.layer % 6] }}
      onPointerDown={(e) => onDown(e, c, 'body')}
      title={`${name} · ${fmt(c.start)} ~ ${fmt(c.start + L)} (원곡 ${fmt(c.in)}~${fmt(c.out)})`}
    >
      <canvas ref={canvasRef} className="me-wave" style={{ width: w, height: h }} />
      <svg className="me-fades" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {fi > 0 && <path d={`M0 ${h} L0 0 L${fi} 0 Q${fi * 0.3} ${h * 0.25} 0 ${h} Z`} />}
        {fo > 0 && <path d={`M${w} ${h} L${w} 0 L${w - fo} 0 Q${w - fo * 0.3} ${h * 0.25} ${w} ${h} Z`} />}
        {fi > 0 && <path className="line" d={`M0 ${h} Q${fi * 0.3} ${h * 0.25} ${fi} 0`} />}
        {fo > 0 && <path className="line" d={`M${w} ${h} Q${w - fo * 0.3} ${h * 0.25} ${w - fo} 0`} />}
      </svg>
      <span className="me-clip-name">{name}</span>
      <span className="me-clip-len">{fmtShort(L)}</span>
      <div className="me-trim l" onPointerDown={(e) => onDown(e, c, 'in')} title="끌어서 앞부분 자르기" />
      <div className="me-trim r" onPointerDown={(e) => onDown(e, c, 'out')} title="끌어서 뒷부분 자르기" />
      <div className="me-fh" style={{ left: Math.max(4, fi) - 6 }} onPointerDown={(e) => onDown(e, c, 'fadeIn')} title={`페이드인 ${(c.fadeIn || 0).toFixed(1)}초 · 끌어서 조절`} />
      <div className="me-fh" style={{ left: Math.min(w - 4, w - fo) - 6 }} onPointerDown={(e) => onDown(e, c, 'fadeOut')} title={`페이드아웃 ${(c.fadeOut || 0).toFixed(1)}초 · 끌어서 조절`} />
    </div>
  );
}

/** 고른 조각의 숫자 편집 */
function ClipForm({ c, name, dur, apply }) {
  const L = c.out - c.in;
  const num = (label, value, onChange, opt = {}) => (
    <label className="me-num">
      {label}
      <input
        type="number"
        step={opt.step ?? 0.1}
        min={opt.min ?? 0}
        max={opt.max}
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          if (e.target.value.trim() === '') return; // 지우고 다시 입력하는 중
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      <small>초</small>
    </label>
  );
  return (
    <div className="me-form">
      <b title={name}>{name}</b>
      {num('시작', c.start, (v) => apply((m, map) => moveClip(m, map(c.id), v, c.layer, { cross: false }), 'mus-f-s' + c.id), { max: 7200 })}
      {num('원곡에서', c.in, (v) => apply((m, map) => setRange(m, map(c.id), v, c.out + (v - c.in)), 'mus-f-i' + c.id), { max: dur })}
      {num('까지', c.out, (v) => apply((m, map) => setRange(m, map(c.id), c.in, v), 'mus-f-o' + c.id), { max: dur })}
      <span className="me-len">길이 {fmt(L)}</span>
      {num('페이드인', c.fadeIn || 0, (v) => apply((m, map) => setFade(m, map(c.id), 'fadeIn', v), 'mus-f-fi' + c.id), { max: L })}
      {num('페이드아웃', c.fadeOut || 0, (v) => apply((m, map) => setFade(m, map(c.id), 'fadeOut', v), 'mus-f-fo' + c.id), { max: L })}
    </div>
  );
}
