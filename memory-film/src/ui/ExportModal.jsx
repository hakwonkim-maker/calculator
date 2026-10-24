// 영상 내보내기 진행 창
import React, { useEffect, useRef, useState } from 'react';
import { Renderer } from '../engine/renderer.js';
import { RESOLUTIONS, QUALITY } from '../engine/presets.js';
import { fmtTime } from '../engine/math.js';
import { api, baseName } from '../platform.js';
import { Button, Icon } from './controls.jsx';

export function ExportModal({ project, outPath, onClose }) {
  const [st, setSt] = useState({ phase: 'prepare', done: 0, total: 1, elapsed: 0, fps: 0 });
  const cancelRef = useRef(false);
  const thumbRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let renderer = null;
    (async () => {
      const res = RESOLUTIONS[project.output.resolution] || RESOLUTIONS['1080p'];
      const q = QUALITY[project.output.quality] || QUALITY.high;
      const fps = Number(project.output.fps) || 30;
      const t0 = performance.now();
      try {
        const canvas = document.createElement('canvas');
        renderer = new Renderer({ canvas, width: res.w, height: res.h, assetCapacity: 10 });
        const tl = renderer.setProject(project);
        await renderer.prepareFonts();
        renderer.warmup();
        const N = Math.ceil(tl.total * fps);
        setSt((s) => ({ ...s, total: N, phase: 'render' }));
        await api.exportStart({
          path: outPath,
          width: res.w,
          height: res.h,
          fps,
          crf: q.crf,
          preset: q.preset,
          total: N / fps,
          audio: project.music,
        });
        const tctx = thumbRef.current?.getContext('2d');
        let pending = null;
        let lastUi = 0;
        for (let i = 0; i < N; i++) {
          if (cancelRef.current) throw new Error('__cancel');
          await renderer.renderAt(i / fps, 2);
          const buf = renderer.readPixels(new Uint8Array(res.w * res.h * 4));
          if (pending) await pending;
          pending = api.exportFrame(buf);
          const now = performance.now();
          if (now - lastUi > 250 || i === N - 1) {
            lastUi = now;
            const el = (now - t0) / 1000;
            setSt((s) => ({ ...s, done: i + 1, elapsed: el, fps: (i + 1) / el }));
            if (tctx) tctx.drawImage(canvas, 0, 0, tctx.canvas.width, tctx.canvas.height);
          }
        }
        await pending;
        setSt((s) => ({ ...s, phase: 'finalize' }));
        const result = await api.exportFinish();
        setSt((s) => ({ ...s, phase: 'done', result, elapsed: (performance.now() - t0) / 1000 }));
      } catch (e) {
        await api.exportCancel().catch(() => {});
        if (e.message === '__cancel') setSt((s) => ({ ...s, phase: 'cancelled' }));
        else setSt((s) => ({ ...s, phase: 'error', error: e.message || String(e) }));
      } finally {
        renderer?.dispose();
      }
    })();
  }, []);

  const pct = Math.min(100, (st.done / st.total) * 100);
  const remain = st.fps > 0 ? (st.total - st.done) / st.fps : 0;
  const busy = st.phase === 'prepare' || st.phase === 'render' || st.phase === 'finalize';

  return (
    <div className="modal-back">
      <div className="modal export-modal">
        {busy && (
          <>
            <div className="modal-title">
              <span className="spinner" />
              {st.phase === 'prepare' ? '준비하는 중…' : st.phase === 'finalize' ? '마무리하는 중…' : '영상을 만드는 중입니다'}
            </div>
            <canvas ref={thumbRef} width={480} height={270} className="export-thumb" />
            <div className="progress">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="export-stats">
              <span>
                <b>{pct.toFixed(1)}%</b>
              </span>
              <span>
                경과 {fmtTime(st.elapsed)} · 남은 시간 약 {st.done > 30 ? fmtTime(remain) : '계산 중'}
              </span>
              <span>{st.fps ? `${st.fps.toFixed(1)} 프레임/초` : ''}</span>
            </div>
            <p className="hint small">창을 최소화해도 계속 진행됩니다. 완료될 때까지 PC를 끄지 마세요.</p>
            <div className="modal-actions">
              <Button variant="soft" onClick={() => (cancelRef.current = true)} disabled={st.phase === 'finalize'}>
                취소
              </Button>
            </div>
          </>
        )}
        {st.phase === 'done' && (
          <>
            <div className="done-badge">
              <Icon name="check" size={34} />
            </div>
            <div className="modal-title center">영상이 완성되었습니다</div>
            <p className="done-file">{baseName(st.result.path)}</p>
            <p className="hint center">
              {(st.result.size / 1024 / 1024).toFixed(1)}MB · 제작 시간 {fmtTime(st.elapsed)}
            </p>
            <p className="hint small center">행사 전 실제 상영 PC·프로젝터에서 처음부터 끝까지 한 번 재생해 보시길 권장합니다.</p>
            <div className="modal-actions">
              <Button variant="soft" icon="folder" onClick={() => api.showItem(st.result.path)}>
                폴더 열기
              </Button>
              <Button variant="primary" icon="play" onClick={() => api.openPath(st.result.path)}>
                영상 재생
              </Button>
              <Button onClick={onClose}>닫기</Button>
            </div>
          </>
        )}
        {(st.phase === 'error' || st.phase === 'cancelled') && (
          <>
            <div className="modal-title">{st.phase === 'error' ? '영상을 만들지 못했습니다' : '취소되었습니다'}</div>
            {st.error && <pre className="error-box">{st.error}</pre>}
            {st.phase === 'error' && <p className="hint small">저장 위치의 여유 공간과 쓰기 권한을 확인한 뒤 다시 시도해 주세요.</p>}
            <div className="modal-actions">
              <Button variant="primary" onClick={onClose}>
                닫기
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
