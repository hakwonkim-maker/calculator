// WebGL2 합성기: 두 장면 텍스처 → 전환 셰이더 → 색보정/비네팅/그레인 → 화면
import { transitionSource, VERTEX_SRC } from './transitions.js';

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
    for (const id of ids) this._program(id);
  }

  upload(which, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, which === 'from' ? this.texFrom : this.texTo);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  draw({ transition, progress, time, fromLook, toLook, look, vignette, grain }) {
    const gl = this.gl;
    const { width: w, height: h } = this.canvas;
    const { p, u } = this._program(transition);
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
  }

  /** 하단부터 저장된 RGBA 픽셀 (인코더에서 vflip 처리) */
  readPixels(out) {
    const gl = this.gl;
    const { width: w, height: h } = this.canvas;
    const buf = out || new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
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
