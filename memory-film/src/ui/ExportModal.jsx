// 영상 내보내기 진행 창
import React, { useEffect, useRef, useState } from 'react';
import { Renderer } from '../engine/renderer.js';
import { QUALITY, RESOLUTIONS, outputSize } from '../engine/presets.js';
import { fmtTime } from '../engine/math.js';
import { api, baseName } from '../platform.js';
import { Button, Icon } from './controls.jsx';

const SPEED_KEY = 'memoria.exportSpeed.v1';

/** 이 PC에서 측정된 제작 속도로 예상 시간 계산 (초). 기록이 없으면 null */
export function estimateExportSeconds(w, h, frames) {
  try {
    const sp = JSON.parse(localStorage.getItem(SPEED_KEY) || 'null');
    if (!sp || !sp.pps) return null;
    return (frames * w * h) / sp.pps + 4;
  } catch {
    return null;
  }
}

/**
 * opts.draft: 빠른 확인용 시안 (720p · 빠른 압축)
 */
export function ExportModal({ project, outPath, onClose, draft = false }) {
  const [st, setSt] = useState({ phase: 'prepare', done: 0, total: 1, elapsed: 0, fps: 0, encoderLabel: '' });
  const cancelRef = useRef(false);
  const thumbRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const proj = draft ? { ...project, output: { ...project.output, resolution: '720p', quality: 'draft' } } : project;

    const run = async (encoderPref) => {
      let renderer = null;
      let encoder = 'libx264';
      const res = outputSize(proj);
      const q = QUALITY[proj.output.quality] || QUALITY.high;
      const fps = Number(proj.output.fps) || 30;
      const t0 = performance.now();
      try {
        const canvas = document.createElement('canvas');
        renderer = new Renderer({ canvas, width: res.w, height: res.h, assetCapacity: 12 });
        const tl = renderer.setProject(proj);
        await renderer.prepareFonts();
        renderer.warmup(true); // 이 영상에 쓰이는 전환만 컴파일
        const comp = renderer.compositor;
        const cap = comp.setupCapture(true); // GPU에서 YUV420 변환 (가능한 크기일 때)
        const N = Math.ceil(tl.total * fps);
        setSt((s) => ({ ...s, total: N, phase: 'render', done: 0 }));
        const started = await api.exportStart({
          path: outPath,
          width: res.w,
          height: res.h,
          fps,
          crf: q.crf,
          preset: q.preset,
          mbps: (RESOLUTIONS[proj.output.resolution] || RESOLUTIONS['1080p']).bitrate,
          encoder: encoderPref,
          pixfmt: cap.format,
          total: N / fps,
          audio: proj.music,
        });
        encoder = started.encoder;
        setSt((s) => ({ ...s, encoderLabel: started.label }));
        const tctx = thumbRef.current?.getContext('2d');
        const bufs = [new Uint8Array(cap.bytes), new Uint8Array(cap.bytes)];
        let pending = null;
        let lastUi = 0;
        // 파이프라인: 프레임 i를 그리는 동안 프레임 i-1을 GPU에서 읽어 FFmpeg로 전송
        const flush = async (k) => {
          const b = await comp.captureFinish(k % 2, bufs[k % 2]);
          if (pending) await pending;
          pending = api.exportFrame(b);
        };
        for (let i = 0; i < N; i++) {
          if (cancelRef.current) throw new Error('__cancel');
          await renderer.renderAt(i / fps, 4);
          if (comp.isLost()) throw new Error('그래픽 장치가 초기화되어 영상을 계속 만들 수 없습니다. 다른 프로그램을 닫고 다시 시도해 주세요.');
          comp.captureStart(i % 2);
          if (i > 0) await flush(i - 1);
          const now = performance.now();
          if (now - lastUi > 300 || i === N - 1) {
            lastUi = now;
            const el = (now - t0) / 1000;
            setSt((s) => ({ ...s, done: i + 1, elapsed: el, fps: (i + 1) / el }));
            api.exportProgress?.((i + 1) / N);
            if (tctx) {
              comp.present();
              tctx.drawImage(canvas, 0, 0, tctx.canvas.width, tctx.canvas.height);
            }
          }
        }
        if (N > 0) await flush(N - 1);
        await pending;
        setSt((s) => ({ ...s, phase: 'finalize' }));
        const result = await api.exportFinish();
        const elapsed = (performance.now() - t0) / 1000;
        try {
          localStorage.setItem(SPEED_KEY, JSON.stringify({ pps: (N * res.w * res.h) / elapsed, encoder, at: Date.now() }));
        } catch {
          /* 무시 */
        }
        setSt((s) => ({ ...s, phase: 'done', result, elapsed }));
        api.notifyDone?.('영상이 완성되었습니다', baseName(result.path));
      } catch (e) {
        await api.exportCancel().catch(() => {});
        api.exportProgress?.(-1);
        if (e.message === '__cancel') return setSt((s) => ({ ...s, phase: 'cancelled' }));
        // 그래픽카드 인코더가 실패하면 CPU 인코딩으로 자동 재시도
        if (encoder !== 'libx264' && encoderPref !== 'cpu') {
          setSt((s) => ({ ...s, phase: 'prepare', note: '그래픽 가속 인코딩에 실패해 CPU 방식으로 다시 만듭니다…' }));
          renderer?.dispose();
          renderer = null;
          return run('cpu');
        }
        setSt((s) => ({ ...s, phase: 'error', error: e.message || String(e) }));
      } finally {
        renderer?.dispose();
      }
    };
    run(proj.output.encoder === 'cpu' ? 'cpu' : 'auto');
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
              {st.phase === 'prepare' ? '준비하는 중…' : st.phase === 'finalize' ? '마무리하는 중…' : draft ? '확인용 시안을 만드는 중입니다' : '영상을 만드는 중입니다'}
            </div>
            <canvas ref={thumbRef} width={Math.round(270 * (outputSize(project).w / outputSize(project).h))} height={270} className="export-thumb" style={{ aspectRatio: `${outputSize(project).w} / ${outputSize(project).h}` }} />
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
            {st.note && <p className="hint small">{st.note}</p>}
            <p className="hint small">
              {st.encoderLabel && <>인코딩: {st.encoderLabel} · </>}창을 최소화하거나 다른 작업을 해도 계속 진행되며, 끝나면 알림이 뜹니다.
            </p>
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
