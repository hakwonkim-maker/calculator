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

// ---------------------------------------------------------------- 인코더
// 하드웨어 인코더(그래픽카드)는 CPU 인코딩보다 수 배 빠르다. 실제로 1회 인코딩해 보고 되는 것만 사용.
const HW_CANDIDATES = {
  win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'],
  darwin: ['h264_videotoolbox'],
  linux: ['h264_nvenc'],
};
const ENCODER_LABEL = {
  libx264: 'CPU (x264)',
  h264_nvenc: 'NVIDIA 그래픽 가속',
  h264_qsv: 'Intel 그래픽 가속',
  h264_amf: 'AMD 그래픽 가속',
  h264_videotoolbox: 'Apple 하드웨어 가속',
};

function videoArgs(enc, q) {
  const crf = Number(q.crf) || 18;
  switch (enc) {
    case 'h264_nvenc':
      return { pix: 'yuv420p', args: ['-c:v', 'h264_nvenc', '-preset', 'p5', '-tune', 'hq', '-rc', 'vbr', '-cq', String(crf + 1), '-b:v', '0', '-maxrate', '80M', '-bufsize', '160M', '-profile:v', 'high'] };
    case 'h264_qsv':
      return { pix: 'nv12', args: ['-c:v', 'h264_qsv', '-preset', 'slow', '-global_quality', String(crf + 3), '-profile:v', 'high'] };
    case 'h264_amf':
      return { pix: 'yuv420p', args: ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', String(crf), '-qp_p', String(crf + 2), '-profile:v', 'high'] };
    case 'h264_videotoolbox':
      return { pix: 'yuv420p', args: ['-c:v', 'h264_videotoolbox', '-b:v', `${Math.max(4, q.mbps || 16)}M`, '-profile:v', 'high'] };
    case 'libx264':
    default:
      if (enc !== 'libx264') throw new Error('설정이 없는 인코더: ' + enc);
      return { pix: 'yuv420p', args: ['-c:v', 'libx264', '-preset', q.preset || 'faster', '-crf', String(crf), '-tune', 'film', '-profile:v', 'high'] };
  }
}

let detected = null;
/** 사용 가능한 하드웨어 인코더 목록 (앱 실행 중 1회 측정 후 캐시) */
function detectEncoders() {
  if (detected) return detected;
  const list = HW_CANDIDATES[process.platform] || [];
  detected = (async () => {
    const ok = [];
    for (const enc of list) {
      let spec;
      try {
        spec = videoArgs(enc, { crf: 20, mbps: 8 });
      } catch {
        continue; // 전용 설정이 없는 인코더는 후보에서 제외
      }
      const { pix, args } = spec;
      const res = await new Promise((resolve) => {
        const p = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1280x720:d=0.4:r=30', '-pix_fmt', pix, ...args, '-f', 'null', '-'], { windowsHide: true });
        const timer = setTimeout(() => p.kill('SIGKILL'), 8000);
        p.on('error', () => resolve(false));
        p.on('close', (code) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
      });
      if (res) ok.push(enc);
    }
    return ok;
  })();
  return detected;
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
    const { width, height, fps, total, audio, path: out, pixfmt = 'rgba', encoder = 'libx264' } = this.opts;
    const a = buildAudio(audio, total);
    const venc = videoArgs(encoder, this.opts);
    const args = ['-hide_banner', '-y', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', pixfmt, '-s', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0'];
    if (a) args.push(...a.inputs);
    // yuv420p 입력은 GPU에서 이미 BT.709 limited 범위로 변환·정방향 정렬된 상태 → 변환 없음
    const conv = pixfmt === 'yuv420p'
      ? (venc.pix === 'yuv420p' ? 'null' : `format=${venc.pix}`)
      : `vflip,scale=out_color_matrix=bt709:out_range=tv,format=${venc.pix}`;
    const v = `[0:v]${conv}[vout]`;
    // 필터가 길어져도 Windows 명령줄 길이 제한(32K)에 걸리지 않도록 파일로 전달
    this.scriptPath = path.join(os.tmpdir(), `memoria-filter-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(this.scriptPath, a ? `${v};${a.filter}` : v, 'utf8');
    args.push('-filter_complex_script', this.scriptPath, '-map', '[vout]');
    if (a) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
    args.push(
      ...venc.args, '-pix_fmt', venc.pix,
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

module.exports = { Exporter, buildAudio, detectEncoders, ENCODER_LABEL };
