// FFmpeg 인코더: 렌더러가 보낸 RGBA 프레임을 stdin으로 받아 H.264 MP4 생성
// 배경음악(여러 곡 크로스페이드, 반복, 페이드인/아웃)도 여기서 합성한다.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function ffmpegPath() {
  let p = process.env.MF_FFMPEG || require('ffmpeg-static');
  // asar 패키징 시 실행 파일은 app.asar.unpacked 에 있음
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

/** 음악 트랙 목록 → ffmpeg 입력 인자 + 필터 그래프 */
function buildAudio(audio, total) {
  const tracks = (audio?.tracks || []).filter((t) => t.path && t.duration > 0.5 && fs.existsSync(t.path));
  if (!tracks.length) return null;
  const xf = Math.max(0, Number(audio.crossfade) || 0);
  // 반복: 영상 길이를 채울 때까지 트랙 목록을 이어붙임
  const seq = [];
  let len = 0;
  let guard = 0;
  do {
    for (const t of tracks) {
      seq.push(t);
      len += t.duration - (seq.length > 1 ? Math.min(xf, t.duration / 2) : 0);
      if (len >= total + 1) break;
    }
    guard++;
  } while (audio.loop && len < total + 1 && guard < 200);

  const inputs = [];
  const parts = [];
  seq.forEach((t, i) => {
    inputs.push('-i', t.path);
    parts.push(`[${i + 1}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[s${i}]`);
  });
  let cur = 's0';
  for (let i = 1; i < seq.length; i++) {
    const d = Math.max(0.05, Math.min(xf, seq[i - 1].duration / 2, seq[i].duration / 2));
    const out = `x${i}`;
    if (xf > 0.05) parts.push(`[${cur}][s${i}]acrossfade=d=${d.toFixed(3)}:c1=qsin:c2=qsin[${out}]`);
    else parts.push(`[${cur}][s${i}]concat=n=2:v=0:a=1[${out}]`);
    cur = out;
  }
  const fi = Math.max(0, Number(audio.fadeIn) || 0);
  const fo = Math.max(0, Number(audio.fadeOut) || 0);
  const vol = Math.max(0, Math.min(2, Number(audio.volume ?? 1)));
  let chain = `[${cur}]apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},asetpts=N/SR/TB`;
  if (fi > 0) chain += `,afade=t=in:st=0:d=${fi.toFixed(2)}`;
  if (fo > 0) chain += `,afade=t=out:st=${Math.max(0, total - fo).toFixed(3)}:d=${fo.toFixed(2)}`;
  chain += `,volume=${vol.toFixed(3)}[aout]`;
  parts.push(chain);
  return { inputs, filter: parts.join(';') };
}

class Exporter {
  constructor(opts) {
    this.opts = opts;
    this.running = false;
    this.log = '';
    this.proc = null;
    this.exitPromise = null;
    this.cancelled = false;
  }

  args() {
    const { width, height, fps, crf = 18, preset = 'medium', total, audio, path: out } = this.opts;
    const a = buildAudio(audio, total);
    const args = ['-hide_banner', '-y', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0'];
    if (a) args.push(...a.inputs);
    const v = '[0:v]vflip,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[vout]';
    // 필터가 길어져도 Windows 명령줄 길이 제한(32K)에 걸리지 않도록 파일로 전달
    this.scriptPath = path.join(os.tmpdir(), `memoria-filter-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(this.scriptPath, a ? `${v};${a.filter}` : v, 'utf8');
    args.push('-filter_complex_script', this.scriptPath, '-map', '[vout]');
    if (a) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
    args.push(
      '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-tune', 'film',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-g', String(Math.round(fps * 2)), '-movflags', '+faststart',
      '-t', total.toFixed(3), out,
    );
    return args;
  }

  async start() {
    const out = this.opts.path;
    await fs.promises.mkdir(path.dirname(out), { recursive: true });
    this.tmp = out;
    const args = this.args();
    this.proc = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    this.running = true;
    this.proc.stderr.on('data', (d) => {
      this.log = (this.log + d.toString()).slice(-6000);
    });
    this.proc.stdin.on('error', () => {});
    this.exitPromise = new Promise((resolve) => {
      this.proc.on('error', (err) => {
        this.log += '\n' + err.message;
        this.running = false;
        resolve(-1);
      });
      this.proc.on('close', (code) => {
        this.running = false;
        resolve(code);
      });
    });
  }

  writeFrame(data) {
    if (!this.running) return Promise.reject(new Error('인코더가 종료되었습니다.\n' + this.log));
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return new Promise((resolve, reject) => {
      const ok = this.proc.stdin.write(buf, (err) => (err && !this.cancelled ? reject(new Error('인코더 쓰기 실패: ' + this.log)) : null));
      if (ok) resolve();
      else this.proc.stdin.once('drain', resolve);
    });
  }

  cleanup() {
    if (this.scriptPath) fs.promises.rm(this.scriptPath, { force: true }).catch(() => {});
  }

  async finish() {
    this.proc.stdin.end();
    const code = await this.exitPromise;
    this.cleanup();
    if (code !== 0) throw new Error(`영상 인코딩 실패 (코드 ${code})\n${this.log}`);
    const st = await fs.promises.stat(this.opts.path);
    return { path: this.opts.path, size: st.size };
  }

  async cancel() {
    this.cancelled = true;
    if (this.proc && this.running) {
      try {
        this.proc.stdin.destroy();
      } catch {}
      this.proc.kill('SIGKILL');
      await this.exitPromise;
    }
    this.cleanup();
    await fs.promises.rm(this.opts.path, { force: true }).catch(() => {});
  }
}

module.exports = { Exporter, buildAudio };
