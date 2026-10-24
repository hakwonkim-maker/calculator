// WebGL2 합성기: 두 장면 텍스처 → 전환 셰이더 → 색보정/비네팅/그레인 → 화면
// 내보내기 시에는 GPU에서 바로 YUV420(BT.709)로 변환해 읽어온다:
//   RGBA 8MB/프레임 → YUV 3MB/프레임 (1080p), FFmpeg의 색변환·상하반전 단계도 생략
import { transitionSource, VERTEX_SRC, USES_MIPMAPS } from './transitions.js';

const YUV_SRC = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform ivec2 uSize;
out vec4 o;
vec3 px(int x, int yTop) { return texelFetch(uSrc, ivec2(x, uSize.y - 1 - yTop), 0).rgb; }
float Y(vec3 c) { return (16.0 + 219.0 * dot(c, vec3(0.2126, 0.7152, 0.0722))) / 255.0; }
float U(vec3 c) { return (128.0 + 224.0 * dot(c, vec3(-0.114572, -0.385428, 0.5))) / 255.0; }
float V(vec3 c) { return (128.0 + 224.0 * dot(c, vec3(0.5, -0.454153, -0.045847))) / 255.0; }
void main() {
  int W = uSize.x;
  int H = uSize.y;
  int ox = int(gl_FragCoord.x);
  int oy = int(gl_FragCoord.y); // = 메모리상의 행 번호 (readPixels는 아래 행부터 저장)
  if (oy < H) {
    int x0 = ox * 4;
    o = vec4(Y(px(x0, oy)), Y(px(x0 + 1, oy)), Y(px(x0 + 2, oy)), Y(px(x0 + 3, oy)));
    return;
  }
  int r = oy - H;
  bool isV = r >= H / 4;
  if (isV) r -= H / 4;
  int half8 = W / 8;
  int crow = r * 2 + (ox >= half8 ? 1 : 0);
  int cx0 = (ox % half8) * 4;
  vec4 res;
  for (int k = 0; k < 4; k++) {
    int cx = cx0 + k;
    vec3 c = (px(2 * cx, 2 * crow) + px(2 * cx + 1, 2 * crow) + px(2 * cx, 2 * crow + 1) + px(2 * cx + 1, 2 * crow + 1)) * 0.25;
    res[k] = isV ? V(c) : U(c);
  }
  o = res;
}`;

export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('이 PC의 그래픽 환경에서 WebGL2를 사용할 수 없습니다.');
    this.gl = gl;
    this.programs = new Map();
    this.vao = gl.createVertexArray();
    this.texFrom = this._makeTex();
    this.texTo = this._makeTex();
  }

  _makeTex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    return t;
  }

  _program(id) {
    if (this.programs.has(id)) return this.programs.get(id);
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error(`셰이더 컴파일 실패(${id}): ${log}`);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, transitionSource(id)));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`셰이더 링크 실패(${id}): ${gl.getProgramInfoLog(p)}`);
    const names = ['uFrom', 'uTo', 'progress', 'ratio', 'uRes', 'uTime', 'uFromLook', 'uToLook', 'uLook', 'uFadeLook', 'uVignette', 'uGrain'];
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    const prog = { p, u };
    this.programs.set(id, prog);
    return prog;
  }

  /** 모든 셰이더를 미리 컴파일 (첫 전환에서 끊김 방지) */
  warmup(ids) {
    const failed = [];
    for (const id of ids) {
      try {
        this._program(id);
      } catch (e) {
        failed.push(id);
        console.warn(e);
      }
    }
    return failed;
  }

  /** mips: 블러를 쓰는 전환일 때만 밉맵 생성 (그 외엔 생략해 업로드 비용 절감) */
  upload(which, source, mips = true) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, which === 'from' ? this.texFrom : this.texTo);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  }

  needsMips(transition) {
    return USES_MIPMAPS.has(transition);
  }

  // ------------------------------------------------------------ 내보내기 캡처
  /**
   * 캡처 준비. 가능하면 YUV420(GPU 변환), 크기가 맞지 않으면 RGBA.
   * 반환: { format: 'yuv420p' | 'rgba', bytes }
   */
  setupCapture(preferYuv = true) {
    const gl = this.gl;
    const { width: w, height: h } = this.canvas;
    const yuv = preferYuv && w % 8 === 0 && h % 4 === 0;
    this.capture = { format: yuv ? 'yuv420p' : 'rgba', w, h, pbos: [], fences: [] };
    if (yuv) {
      const mkTarget = (tw, th, filter) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, tw, th);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { tex, fbo };
      };
      this.capture.scene = mkTarget(w, h, gl.NEAREST);
      this.capture.out = mkTarget(w / 4, (h * 3) / 2, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const sh = (type, src) => {
        const o = gl.createShader(type);
        gl.shaderSource(o, src);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('YUV 셰이더 실패: ' + gl.getShaderInfoLog(o));
        return o;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERTEX_SRC));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, YUV_SRC));
      gl.linkProgram(p);
      this.capture.prog = { p, uSrc: gl.getUniformLocation(p, 'uSrc'), uSize: gl.getUniformLocation(p, 'uSize') };
      this.capture.bytes = (w * h * 3) / 2;
    } else {
      this.capture.bytes = w * h * 4;
    }
    for (let i = 0; i < 2; i++) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this.capture.bytes, gl.STREAM_READ);
      this.capture.pbos.push(b);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return { format: this.capture.format, bytes: this.capture.bytes };
  }

  /** 방금 그린 프레임을 슬롯에 비동기로 읽기 시작 (GPU가 끝날 때까지 기다리지 않음) */
  captureStart(slot) {
    const gl = this.gl;
    const c = this.capture;
    if (c.format === 'yuv420p') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.out.fbo);
      gl.viewport(0, 0, c.w / 4, (c.h * 3) / 2);
      gl.useProgram(c.prog.p);
      gl.bindVertexArray(this.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, c.scene.tex);
      gl.uniform1i(c.prog.uSrc, 0);
      gl.uniform2i(c.prog.uSize, c.w, c.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, c.pbos[slot]);
    if (c.format === 'yuv420p') gl.readPixels(0, 0, c.w / 4, (c.h * 3) / 2, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    else gl.readPixels(0, 0, c.w, c.h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    c.fences[slot] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  /** 슬롯의 읽기가 끝나면 out 버퍼로 복사 */
  async captureFinish(slot, out) {
    const gl = this.gl;
    const c = this.capture;
    const f = c.fences[slot];
    if (f) {
      for (let i = 0; i < 2000; i++) {
        const st = gl.clientWaitSync(f, 0, 0);
        if (st === gl.ALREADY_SIGNALED || st === gl.CONDITION_SATISFIED || st === gl.WAIT_FAILED) break;
        await new Promise((r) => setTimeout(r, 0));
      }
      gl.deleteSync(f);
      c.fences[slot] = null;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, c.pbos[slot]);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return out;
  }

  /** 내보내기 진행창 미리보기용: 캡처 대상 화면을 캔버스로 복사 */
  present() {
    const gl = this.gl;
    const c = this.capture;
    if (!c || c.format !== 'yuv420p') return;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, c.scene.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, c.w, c.h, 0, 0, c.w, c.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  draw({ transition, progress, time, fromLook, toLook, look, vignette, grain }) {
    const gl = this.gl;
    const { width: w, height: h } = this.canvas;
    let prog;
    try {
      prog = this._program(transition);
    } catch (e) {
      // 특정 그래픽 드라이버에서 컴파일이 안 되는 효과는 디졸브로 대체
      console.warn(e);
      prog = this._program(transition === 'none' ? 'none' : 'fade');
    }
    const { p, u } = prog;
    // 캡처(YUV) 모드면 화면 대신 오프스크린 텍스처에 그림
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.capture?.scene ? this.capture.scene.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texFrom);
    gl.uniform1i(u.uFrom, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texTo);
    gl.uniform1i(u.uTo, 1);
    gl.uniform1f(u.progress, Math.min(1, Math.max(0, progress)));
    gl.uniform1f(u.ratio, w / h);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uFromLook, fromLook);
    gl.uniform1f(u.uToLook, toLook);
    gl.uniform4f(u.uLook, look.warmth, look.sat, look.contrast, look.lift);
    gl.uniform1f(u.uFadeLook, look.fade || 0);
    gl.uniform1f(u.uVignette, vignette);
    gl.uniform1f(u.uGrain, grain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** 하단부터 저장된 RGBA 픽셀 (인코더에서 vflip 처리) */
  readPixels(out) {
    const gl = this.gl;
    const { width: w, height: h } = this.canvas;
    const buf = out || new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }

  isLost() {
    return this.gl.isContextLost();
  }

  dispose() {
    const gl = this.gl;
    for (const { p } of this.programs.values()) gl.deleteProgram(p);
    gl.deleteTexture(this.texFrom);
    gl.deleteTexture(this.texTo);
    this.programs.clear();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
