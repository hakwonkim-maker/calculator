// 미리보기 플레이어: 실시간 재생 · 스크럽 · 장면 마커
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { Renderer } from '../engine/renderer.js';
import { fmtTime } from '../engine/math.js';
import { Icon } from './controls.jsx';

const PREVIEW_RES = { standard: [960, 540], high: [1280, 720] };
const SEG_COLORS = { intro: '#d9b867', outro: '#d9b867', chapter: '#8fa7c9', photo: '#5b564e' };

export const Preview = forwardRef(function Preview({ project, tl, quality, audio, onTick, onPlayingChange, onError }, ref) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const timeRef = useRef(0);
  const playRef = useRef({ playing: false, baseT: 0, baseClock: 0, raf: 0 });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const total = tl.total;
  const projectRef = useRef(project);
  projectRef.current = project;

  // 렌더러 생성 (화질 변경 시 재생성)
  useEffect(() => {
    const [w, h] = PREVIEW_RES[quality] || PREVIEW_RES.standard;
    let r;
    try {
      r = new Renderer({ canvas: canvasRef.current, width: w, height: h, assetCapacity: 16 });
    } catch (e) {
      onError?.(e.message);
      return undefined;
    }
    rendererRef.current = r;
    r.setProject(projectRef.current);
    try {
      r.warmup();
    } catch (e) {
      onError?.(e.message);
    }
    return () => {
      rendererRef.current = null;
      r.dispose();
    };
  }, [quality]);

  const draw = useCallback((t) => {
    const r = rendererRef.current;
    if (!r) return;
    r.renderPreview(t);
    if (!r.isReadyAt(t)) {
      r.ensureAt(t).then(() => {
        if (!playRef.current.playing && Math.abs(timeRef.current - t) < 1e-6 && rendererRef.current === r) r.renderSync(t);
      });
    }
  }, []);

  // 프로젝트 변경 → 타임라인 재구성 + 현재 프레임 다시 그리기
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.setProject(project);
    let cancelled = false;
    r.prepareFonts().then(() => {
      if (cancelled) return;
      setFontsReady(true);
      if (!playRef.current.playing) draw(timeRef.current);
    });
    if (!playRef.current.playing) draw(Math.min(timeRef.current, Math.max(0, r.duration - 0.001)));
    return () => {
      cancelled = true;
    };
  }, [project, quality, draw]);

  const setT = useCallback(
    (t) => {
      t = Math.max(0, Math.min(t, Math.max(0, total - 0.001)));
      timeRef.current = t;
      setTime(t);
      onTick?.(t);
      return t;
    },
    [total, onTick],
  );

  const stop = useCallback(() => {
    const st = playRef.current;
    st.playing = false;
    cancelAnimationFrame(st.raf);
    audio.stop();
    setPlaying(false);
    onPlayingChange?.(false);
  }, [audio, onPlayingChange]);

  const play = useCallback(async () => {
    const r = rendererRef.current;
    if (!r || total <= 0) return;
    let from = timeRef.current;
    if (from >= total - 0.05) from = setT(0);
    await r.ensureAt(from, 2);
    const st = playRef.current;
    st.playing = true;
    setPlaying(true);
    onPlayingChange?.(true);
    const startClock = await audio.play(projectRef.current.music, from, total);
    if (!st.playing) return audio.stop();
    st.baseT = from;
    st.baseClock = startClock;
    let lastUi = 0;
    const loop = () => {
      if (!st.playing) return;
      const t = st.baseT + Math.max(0, audio.now() - st.baseClock);
      if (t >= total) {
        setT(total - 0.001);
        draw(total - 0.001);
        stop();
        return;
      }
      timeRef.current = t;
      draw(t);
      const now = performance.now();
      if (now - lastUi > 120) {
        lastUi = now;
        setTime(t);
        onTick?.(t);
      }
      st.raf = requestAnimationFrame(loop);
    };
    st.raf = requestAnimationFrame(loop);
  }, [audio, draw, onPlayingChange, onTick, setT, stop, total]);

  const seek = useCallback(
    (t) => {
      const wasPlaying = playRef.current.playing;
      if (wasPlaying) stop();
      const tt = setT(t);
      draw(tt);
      if (wasPlaying) play();
    },
    [draw, play, setT, stop],
  );

  useImperativeHandle(ref, () => ({
    seek,
    play,
    pause: stop,
    toggle: () => (playRef.current.playing ? stop() : play()),
    get time() {
      return timeRef.current;
    },
  }));

  useEffect(() => () => stop(), [stop]);

  // 스크럽 바
  const barRef = useRef(null);
  const scrubbing = useRef(false);
  const posToTime = (clientX) => {
    const rect = barRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * total;
  };
  const onBarDown = (e) => {
    scrubbing.current = true;
    if (playRef.current.playing) stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = setT(posToTime(e.clientX));
    draw(t);
  };
  const onBarMove = (e) => {
    if (!scrubbing.current) return;
    const t = setT(posToTime(e.clientX));
    draw(t);
  };
  const onBarUp = () => {
    scrubbing.current = false;
  };

  const fullscreen = () => {
    const el = canvasRef.current?.parentElement;
    if (el?.requestFullscreen) el.requestFullscreen();
  };

  return (
    <div className="preview">
      <div className="preview-stage">
        <div className="preview-frame">
          <canvas ref={canvasRef} className="preview-canvas" onClick={() => (playRef.current.playing ? stop() : play())} />
          {!fontsReady && <div className="preview-loading">폰트 준비 중…</div>}
          {!project.items.length && !project.intro.enabled && <div className="preview-empty">사진을 추가하면 이곳에서 미리볼 수 있습니다</div>}
        </div>
      </div>
      <div className="transport">
        <button className="tbtn" title="처음으로" onClick={() => seek(0)}>
          <Icon name="back" size={15} />
        </button>
        <button className="tbtn play" title="재생/일시정지 (Space)" onClick={() => (playing ? stop() : play())}>
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <div className="tc">
          <b>{fmtTime(time)}</b>
          <span> / {fmtTime(total)}</span>
        </div>
        <div className="scrub" ref={barRef} onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={onBarUp}>
          <div className="scrub-track">
            {total > 0 &&
              tl.segments.map((s) => (
                <div
                  key={s.key}
                  className="scrub-seg"
                  style={{ left: `${(s.start / total) * 100}%`, width: `${((s.dur - s.tOut) / total) * 100}%`, background: SEG_COLORS[s.type] }}
                />
              ))}
          </div>
          <div className="scrub-fill" style={{ width: `${total ? (time / total) * 100 : 0}%` }} />
          <div className="scrub-head" style={{ left: `${total ? (time / total) * 100 : 0}%` }} />
        </div>
        <button className="tbtn" title="전체 화면 미리보기" onClick={fullscreen}>
          <Icon name="expand" size={16} />
        </button>
      </div>
    </div>
  );
});
