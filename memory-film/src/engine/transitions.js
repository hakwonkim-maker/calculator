// GLSL 전환 효과 라이브러리
// 각 전환은 vec4 transition(vec2 uv) 함수를 정의한다.
// 일부 효과는 gl-transitions(MIT) 컬렉션의 아이디어를 참고해 새로 작성했다.

export const TRANSITIONS = {
  fade: { name: '디졸브', desc: '가장 부드러운 교차 전환' },
  blurDissolve: { name: '블러 디졸브', desc: '흐려지며 꿈결처럼 전환' },
  lumaReveal: { name: '빛 번짐', desc: '밝은 부분부터 스며드는 전환' },
  lightLeak: { name: '라이트 릭', desc: '필름에 빛이 새어드는 따뜻한 전환' },
  morph: { name: '모프', desc: '이미지가 녹아들듯 변형' },
  softWipe: { name: '소프트 와이프', desc: '사선으로 부드럽게 넘김' },
  iris: { name: '아이리스', desc: '중앙에서 원형으로 열림' },
  dipBlack: { name: '블랙 페이드', desc: '검은 화면을 거쳐 전환' },
  dipWhite: { name: '화이트 플래시', desc: '빛나는 흰 화면을 거쳐 전환' },
  zoomBlur: { name: '줌 블러', desc: '빠르게 빨려 들어가는 전환' },
  slide: { name: '패럴랙스 슬라이드', desc: '모션블러와 함께 밀어내기' },
  crosswarp: { name: '크로스 워프', desc: '공간이 휘어지며 전환' },
  ripple: { name: '물결', desc: '물결 파동 전환' },
  swirl: { name: '소용돌이', desc: '회오리치며 전환' },
  none: { name: '컷', desc: '즉시 전환' },
};

const BLUR_FN = /* glsl */ `
vec4 blurTex(sampler2D s, vec2 uv, float amount, float look) {
  if (amount < 0.002) return getColor(s, uv, look);
  float radius = amount * 0.045;
  float lod = max(0.0, log2(radius * uRes.x / 6.0));
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 16.0) * radius;
    float a = fi * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r * vec2(1.0 / ratio, 1.0);
    float w = 1.0 - (fi / 16.0) * 0.5;
    acc += lookColor(textureLod(s, uv + off, lod), look) * w;
    wsum += w;
  }
  return acc / wsum;
}
vec4 blurFrom(vec2 uv, float a) { return blurTex(uFrom, uv, a, uFromLook); }
vec4 blurTo(vec2 uv, float a) { return blurTex(uTo, uv, a, uToLook); }
`;

const SRC = {
  none: `vec4 transition(vec2 uv) { return getFromColor(uv); }`,

  fade: `
vec4 transition(vec2 uv) {
  float p = smoothstep(0.0, 1.0, progress);
  return mix(getFromColor(uv), getToColor(uv), p);
}`,

  dipBlack: `
vec4 transition(vec2 uv) {
  float k = pow(sin(3.14159265 * progress), 1.4);
  vec4 c = mix(getFromColor(uv), getToColor(uv), smoothstep(0.42, 0.58, progress));
  return vec4(c.rgb * (1.0 - 0.985 * k), 1.0);
}`,

  dipWhite: `
vec4 transition(vec2 uv) {
  float k = pow(sin(3.14159265 * progress), 1.6);
  vec4 a = blurFrom(uv, k * 0.6);
  vec4 b = blurTo(uv, k * 0.6);
  vec4 c = mix(a, b, smoothstep(0.4, 0.6, progress));
  vec3 white = vec3(1.0, 0.975, 0.93);
  vec3 bloom = 1.0 - (1.0 - c.rgb) * (1.0 - white * k * 0.85);
  return vec4(mix(bloom, white, pow(k, 3.0) * 0.9), 1.0);
}`,

  blurDissolve: `
vec4 transition(vec2 uv) {
  float k = sin(3.14159265 * progress);
  float m = smoothstep(0.22, 0.78, progress);
  vec4 a = blurFrom((uv - 0.5) / (1.0 + 0.03 * progress) + 0.5, k);
  vec4 b = blurTo((uv - 0.5) / (1.03 - 0.03 * progress) + 0.5, k);
  return mix(a, b, m);
}`,

  lumaReveal: `
vec4 transition(vec2 uv) {
  vec4 b = getToColor(uv);
  vec4 bb = blurTo(uv, 0.5);
  float lum = dot(bb.rgb, vec3(0.299, 0.587, 0.114));
  float th = 1.25 - progress * 1.5;
  float m = smoothstep(th - 0.22, th + 0.22, lum);
  m = max(m, smoothstep(0.8, 1.0, progress));
  float glow = (1.0 - abs(m * 2.0 - 1.0)) * sin(3.14159265 * progress) * 0.18;
  vec4 a = getFromColor(uv);
  vec3 c = mix(a.rgb, b.rgb, m) + glow * vec3(1.0, 0.92, 0.78);
  return vec4(c, 1.0);
}`,

  lightLeak: `
vec4 transition(vec2 uv) {
  float p = progress;
  float k = sin(3.14159265 * p);
  vec4 a = blurFrom(uv, k * 0.35);
  vec4 b = blurTo(uv, k * 0.35);
  vec3 base = mix(a.rgb, b.rgb, smoothstep(0.3, 0.7, p));
  vec2 asp = vec2(ratio, 1.0);
  vec2 c1 = vec2(-0.35 + 1.6 * p, 0.28 + 0.12 * sin(p * 4.0));
  vec2 c2 = vec2(1.25 - 1.4 * p, 0.78 - 0.1 * p);
  vec2 c3 = vec2(0.5 + 0.4 * sin(p * 3.0 + 1.0), 0.5);
  float d1 = length((uv - c1) * asp);
  float d2 = length((uv - c2) * asp);
  float d3 = length((uv - c3) * asp);
  vec3 leak = vec3(1.0, 0.42, 0.12) * exp(-d1 * d1 * 2.6) * 1.15
            + vec3(1.0, 0.78, 0.45) * exp(-d2 * d2 * 3.2) * 0.95
            + vec3(1.0, 0.86, 0.62) * exp(-d3 * d3 * 1.8) * 0.18;
  leak *= k * 0.9;
  vec3 col = 1.0 - (1.0 - base) * (1.0 - clamp(leak, 0.0, 1.0));
  col = mix(col, vec3(1.0, 0.95, 0.86), pow(k, 6.0) * 0.12);
  return vec4(col, 1.0);
}`,

  morph: `
vec4 transition(vec2 uv) {
  float strength = 0.09;
  vec4 ca = getFromColor(uv);
  vec4 cb = getToColor(uv);
  vec2 oa = vec2((ca.r + ca.b) * 0.5, (ca.g + ca.b) * 0.5) * 2.0 - 1.0;
  vec2 ob = vec2((cb.r + cb.b) * 0.5, (cb.g + cb.b) * 0.5) * 2.0 - 1.0;
  vec2 oc = mix(oa, ob, 0.5) * strength;
  float p = smoothstep(0.0, 1.0, progress);
  return mix(getFromColor(uv + oc * p), getToColor(uv - oc * (1.0 - p)), p);
}`,

  softWipe: `
vec4 transition(vec2 uv) {
  vec2 dir = normalize(vec2(1.0, -0.42));
  float proj = dot((uv - 0.5) * vec2(ratio, 1.0), dir) / (0.5 * (ratio * abs(dir.x) + abs(dir.y))) * 0.5 + 0.5;
  float f = 0.2;
  float p = smoothstep(0.0, 1.0, progress);
  float e = p * (1.0 + 2.0 * f) - f;
  float m = 1.0 - smoothstep(e - f, e + f, proj);
  float edge = exp(-pow((proj - e) / f * 1.6, 2.0)) * sin(3.14159265 * progress);
  vec4 a = blurFrom(uv, edge * 0.25);
  vec4 b = blurTo(uv, edge * 0.25);
  vec3 c = mix(a.rgb, b.rgb, m) + edge * 0.12 * vec3(1.0, 0.94, 0.82);
  return vec4(c, 1.0);
}`,

  iris: `
vec4 transition(vec2 uv) {
  float p = smoothstep(0.0, 1.0, progress);
  vec2 asp = vec2(ratio, 1.0);
  float maxR = length(vec2(0.5) * asp);
  float d = length((uv - 0.5) * asp) / maxR;
  float f = 0.18;
  float r = p * (1.0 + 2.0 * f) - f;
  float m = 1.0 - smoothstep(r - f, r + f, d);
  vec4 a = getFromColor((uv - 0.5) / (1.0 + 0.06 * p) + 0.5);
  vec4 b = getToColor((uv - 0.5) / (1.1 - 0.1 * p) + 0.5);
  float ring = exp(-pow((d - r) / f * 1.8, 2.0)) * sin(3.14159265 * progress) * 0.1;
  return vec4(mix(a.rgb, b.rgb, m) + ring * vec3(1.0, 0.93, 0.8), 1.0);
}`,

  zoomBlur: `
vec4 radialSample(sampler2D s, vec2 uv, float scale, float strength, float look) {
  vec2 c = vec2(0.5);
  vec2 d = (uv - c) / scale;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 20; i++) {
    float f = 1.0 - strength * float(i) / 19.0;
    acc += getColor(s, c + d * f, look);
  }
  return acc / 20.0;
}
vec4 transition(vec2 uv) {
  float p = progress;
  float m = smoothstep(0.42, 0.58, p);
  float sa = smoothstep(0.0, 0.5, p);
  float sb = smoothstep(1.0, 0.5, p);
  vec4 a = radialSample(uFrom, uv, 1.0 + sa * sa * 0.7, sa * 0.32, uFromLook);
  vec4 b = radialSample(uTo, uv, 1.0 + sb * sb * 0.45, sb * 0.32, uToLook);
  vec4 c = mix(a, b, m);
  return vec4(c.rgb + pow(sin(3.14159265 * p), 6.0) * 0.12, 1.0);
}`,

  slide: `
vec4 transition(vec2 uv) {
  float p = progress < 0.5 ? 4.0 * progress * progress * progress : 1.0 - pow(-2.0 * progress + 2.0, 3.0) / 2.0;
  float v = 3.0 * sin(3.14159265 * progress) * 0.5;
  float edge = 1.0 - p;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float o = (float(i) / 11.0 - 0.5) * v * 0.045;
    vec2 q = vec2(uv.x + o, uv.y);
    vec4 c;
    if (q.x < edge) {
      c = getFromColor(vec2(q.x + p * 0.45, q.y));
      c.rgb *= 1.0 - 0.35 * p;
    } else {
      c = getToColor(vec2(q.x - edge, q.y));
      float sh = smoothstep(0.0, 0.05, q.x - edge);
      c.rgb *= mix(0.7, 1.0, sh);
    }
    acc += c;
  }
  return acc / 12.0;
}`,

  crosswarp: `
vec4 transition(vec2 uv) {
  float x = smoothstep(0.0, 1.0, progress * 2.0 + uv.x - 1.0);
  return mix(getFromColor((uv - 0.5) * (1.0 - x) + 0.5), getToColor((uv - 0.5) * x + 0.5), x);
}`,

  ripple: `
vec4 transition(vec2 uv) {
  vec2 dir = (uv - 0.5) * vec2(ratio, 1.0);
  float dist = length(dir);
  float damp = sin(3.14159265 * progress);
  vec2 off = dir * (sin(progress * dist * 60.0 - progress * 40.0) + 0.5) / 40.0 * damp;
  off /= vec2(ratio, 1.0);
  return mix(getFromColor(uv + off), getToColor(uv - off * 0.5), smoothstep(0.25, 0.85, progress));
}`,

  swirl: `
vec4 transition(vec2 uv) {
  float T = progress;
  vec2 q = (uv - 0.5) * vec2(ratio, 1.0);
  float dist = length(q);
  float radius = 0.9 * ratio;
  if (dist < radius) {
    float pc = (radius - dist) / radius;
    float A = T <= 0.5 ? T / 0.5 : (1.0 - T) / 0.5;
    A = smoothstep(0.0, 1.0, A);
    float th = pc * pc * A * 6.0 * 3.14159265;
    float s = sin(th), c = cos(th);
    q = vec2(dot(q, vec2(c, -s)), dot(q, vec2(s, c)));
  }
  vec2 p2 = q / vec2(ratio, 1.0) + 0.5;
  return mix(getFromColor(p2), getToColor(p2), smoothstep(0.35, 0.65, T));
}`,
};

const HEADER = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float progress;
uniform float ratio;
uniform vec2 uRes;
uniform float uTime;
uniform float uFromLook;
uniform float uToLook;
uniform vec4 uLook;   // warmth, sat, contrast, lift
uniform float uFadeLook;
uniform float uVignette;
uniform float uGrain;
in vec2 vUv;
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 lookColor(vec4 c, float amt) {
  if (amt <= 0.0) return c;
  vec3 x = c.rgb;
  float w = uLook.x;
  x *= vec3(1.0 + 0.07 * w, 1.0 + 0.015 * w, 1.0 - 0.085 * w);
  float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
  x = mix(vec3(l), x, uLook.y);
  vec3 s = x * x * (3.0 - 2.0 * x);
  x = mix(x, s, uLook.z * 2.0);
  x = x * (1.0 - uLook.w) + uLook.w * vec3(1.0, 0.93, 0.82);
  x = mix(x, vec3(0.5, 0.47, 0.43), uFadeLook);
  return vec4(mix(c.rgb, clamp(x, 0.0, 1.0), amt), c.a);
}
vec4 getColor(sampler2D s, vec2 uv, float look) { return lookColor(texture(s, uv), look); }
vec4 getFromColor(vec2 uv) { return getColor(uFrom, uv, uFromLook); }
vec4 getToColor(vec2 uv) { return getColor(uTo, uv, uToLook); }
`;

const FOOTER = /* glsl */ `
void main() {
  vec4 c = transition(vUv);
  vec3 col = c.rgb;
  vec2 asp = vec2(ratio, 1.0);
  float d = length((vUv - 0.5) * asp) / length(vec2(0.5) * asp);
  col *= mix(1.0, smoothstep(1.15, 0.35, d), uVignette);
  vec2 px = vUv * uRes;
  float g = hash12(px + fract(uTime * 7.13) * 1000.0) - 0.5;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += g * uGrain * 0.11 * (0.35 + 0.65 * (1.0 - abs(lum * 2.0 - 1.0)));
  col += (hash12(px * 1.37 + 17.0) - 0.5) / 255.0; // 디더링: 어두운 그라데이션 밴딩 방지
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function transitionSource(id) {
  const body = SRC[id] || SRC.fade;
  return HEADER + BLUR_FN + body + FOOTER;
}

export const VERTEX_SRC = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
