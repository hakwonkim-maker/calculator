// 미리보기용 배경음악 재생 (Web Audio)
// 최종 출력(FFmpeg)과 같은 규칙: 곡 사이 크로스페이드, 반복, 전체 페이드인/아웃
import { mediaUrl } from '../platform.js';

export class AudioPreview {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.sources = [];
    this.master = null;
  }

  _ctx() {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'playback' });
    return this.ctx;
  }

  /** 오디오 파일을 디코딩하고 길이(초)를 반환 */
  async load(path) {
    if (this.buffers.has(path)) return this.buffers.get(path).duration;
    const res = await fetch(mediaUrl(path));
    if (!res.ok) throw new Error('음악 파일을 읽을 수 없습니다');
    const buf = await this._ctx().decodeAudioData(await res.arrayBuffer());
    this.buffers.set(path, buf);
    return buf.duration;
  }

  /** 영상 시간 fromT 부터 재생. 반환: 재생 기준 AudioContext 시각 */
  async play(music, fromT, total) {
    this.stop();
    const ctx = this._ctx();
    if (ctx.state === 'suspended') await ctx.resume();
    const tracks = (music.tracks || []).filter((t) => t.duration > 0.5);
    for (const t of tracks) {
      if (!this.buffers.has(t.path)) {
        try {
          await this.load(t.path);
        } catch {
          /* 무시 */
        }
      }
    }
    const when = ctx.currentTime + 0.05;
    const usable = tracks.filter((t) => this.buffers.has(t.path));
    if (!usable.length) return when;

    const vol = Number(music.volume ?? 1);
    const fi = Number(music.fadeIn) || 0;
    const fo = Number(music.fadeOut) || 0;
    const xf = Number(music.crossfade) || 0;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.master = master;
    const env = (t) => vol * (fi > 0 ? Math.min(1, t / fi) : 1) * (fo > 0 ? Math.min(1, Math.max(0, (total - t) / fo)) : 1);
    master.gain.setValueAtTime(env(fromT), when);
    if (fromT < fi) master.gain.linearRampToValueAtTime(env(fi), when + (fi - fromT));
    const foStart = total - fo;
    if (fromT < foStart) master.gain.setValueAtTime(env(foStart), when + (foStart - fromT));
    if (fromT < total) master.gain.linearRampToValueAtTime(0, when + (total - fromT));

    let s = 0;
    let i = 0;
    let guard = 0;
    while (s < total && guard++ < 400) {
      const tr = usable[i % usable.length];
      const buf = this.buffers.get(tr.path);
      const d = buf.duration;
      const next = usable[(i + 1) % usable.length];
      const x = Math.min(xf, d / 2, next ? this.buffers.get(next.path).duration / 2 : xf);
      const end = s + d;
      if (end > fromT) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        src.connect(g).connect(master);
        const startAt = when + Math.max(0, s - fromT);
        const offset = Math.max(0, fromT - s);
        const gv = (t) => {
          let a = 1;
          if (i > 0 && x > 0) a = Math.min(a, (t - s) / x);
          if (x > 0) a = Math.min(a, (end - t) / x);
          return Math.max(0, Math.min(1, a));
        };
        g.gain.setValueAtTime(gv(Math.max(fromT, s)), startAt);
        if (i > 0 && x > 0 && fromT < s + x) g.gain.linearRampToValueAtTime(1, when + (s + x - fromT));
        if (x > 0 && fromT < end - x) g.gain.setValueAtTime(1, when + (end - x - fromT));
        if (x > 0) g.gain.linearRampToValueAtTime(0, when + Math.max(0, end - fromT));
        src.start(startAt, offset);
        this.sources.push(src);
      }
      if (!music.loop && i + 1 >= usable.length) break;
      s = end - x;
      i++;
    }
    return when;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
      s.disconnect();
    }
    this.sources = [];
    if (this.master) this.master.disconnect();
    this.master = null;
  }
}
