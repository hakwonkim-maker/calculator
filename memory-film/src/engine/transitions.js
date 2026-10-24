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
  slideUp: { name: '위로 밀기', desc: '아래에서 위로 밀어 올림' },
  cube: { name: '큐브', desc: '정육면체가 돌아가듯 전환' },
  heart: { name: '하트', desc: '하트 모양으로 열림 · 웨딩/생일' },
  dots: { name: '도트', desc: '물방울 무늬로 채워짐' },
  blinds: { name: '블라인드', desc: '세로 블라인드가 넘어감' },
  filmBurn: { name: '필름 번', desc: '필름이 타들어가며 전환' },
  glitch: { name: '글리치', desc: '디지털 노이즈 효과' },
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
  float te = (proj - e) / f * 1.6;
  float edge = exp(-te * te) * sin(3.14159265 * progress);
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
  float tr = (d - r) / f * 1.8;
  float ring = exp(-tr * tr) * sin(3.14159265 * progress) * 0.1;
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
  float sb = 1.0 - smoothstep(0.5, 1.0, p);
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
      c = fromL0(vec2(q.x + p * 0.45, q.y));
      c.rgb *= 1.0 - 0.35 * p;
    } else {
      c = toL0(vec2(q.x - edge, q.y));
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

  slideUp: `
vec4 transition(vec2 uv) {
  float p = progress < 0.5 ? 4.0 * progress * progress * progress : 1.0 - pow(-2.0 * progress + 2.0, 3.0) / 2.0;
  float v = 1.5 * sin(3.14159265 * progress);
  float edge = p;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float o = (float(i) / 11.0 - 0.5) * v * 0.045;
    vec2 q = vec2(uv.x, uv.y + o);
    vec4 c;
    if (q.y > edge) {
      c = fromL0(vec2(q.x, q.y - p * 0.45));
      c.rgb *= 1.0 - 0.35 * p;
    } else {
      c = toL0(vec2(q.x, q.y + 1.0 - edge));
      c.rgb *= mix(0.7, 1.0, smoothstep(0.0, 0.05, edge - q.y));
    }
    acc += c;
  }
  return acc / 12.0;
}`,

  cube: `
vec4 face(sampler2D s, vec2 q, float look, float shade) {
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec4 c = lookColor(textureLod(s, q, 0.0), look);
  return vec4(c.rgb * shade, 1.0);
}
vec4 transition(vec2 uv) {
  float p = smoothstep(0.0, 1.0, progress);
  float z = 1.0 - 0.18 * sin(3.14159265 * progress);
  vec2 u = (uv - 0.5) / z + 0.5;
  float edge = 1.0 - p;
  if (u.x < edge) {
    float lx = u.x / max(edge, 1e-4);
    float sc = 1.0 - 0.22 * p * (1.0 - lx);
    return face(uFrom, vec2(lx, (u.y - 0.5) / sc + 0.5), uFromLook, 1.0 - 0.55 * p);
  }
  float lx = (u.x - edge) / max(1.0 - edge, 1e-4);
  float sc = 1.0 - 0.22 * (1.0 - p) * lx;
  return face(uTo, vec2(lx, (u.y - 0.5) / sc + 0.5), uToLook, 0.45 + 0.55 * p);
}`,

  heart: `
float heartF(vec2 p, float size) {
  vec2 o = p / (1.6 * max(size, 1e-4));
  float a = o.x * o.x + o.y * o.y - 0.3;
  return o.x * o.x * o.y * o.y * o.y - a * a * a;
}
vec4 transition(vec2 uv) {
  float size = progress * progress * 1.35;
  vec2 p = (uv - vec2(0.5, 0.42)) * vec2(ratio, 1.0) * 0.9;
  float f = heartF(p, size);
  float m = smoothstep(-0.004, 0.004, f);
  if (progress > 0.98) m = 1.0;
  float glow = (1.0 - smoothstep(0.0, 0.03, abs(f))) * sin(3.14159265 * progress) * 0.25;
  vec3 c = mix(getFromColor(uv).rgb, getToColor(uv).rgb, m) + glow * vec3(1.0, 0.75, 0.8);
  return vec4(c, 1.0);
}`,

  dots: `
vec4 transition(vec2 uv) {
  vec2 g = uv * vec2(ratio, 1.0) * 14.0;
  float d = distance(fract(g), vec2(0.5));
  float dist = distance(uv, vec2(0.5)) * 1.3;
  float r = progress * 1.6 - dist * 0.9;
  float m = 1.0 - smoothstep(r - 0.06, r + 0.06, d);
  m = max(m, smoothstep(0.85, 1.0, progress));
  return mix(getFromColor(uv), getToColor(uv), m);
}`,

  blinds: `
vec4 transition(vec2 uv) {
  float n = 9.0;
  float f = fract(uv.x * n);
  float pp = clamp(progress * 1.35 - uv.x * 0.35, 0.0, 1.0);
  pp = mix(-0.04, 1.04, smoothstep(0.0, 1.0, pp));
  float m = 1.0 - smoothstep(pp - 0.03, pp + 0.03, f);
  float shade = 1.0 - 0.35 * (1.0 - abs(f - pp) * 4.0) * step(abs(f - pp), 0.25) * sin(3.14159265 * progress);
  vec4 c = mix(getFromColor(uv), getToColor(uv), m);
  return vec4(c.rgb * shade, 1.0);
}`,

  filmBurn: `
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
vec4 transition(vec2 uv) {
  vec2 q = uv * vec2(ratio, 1.0) * 2.2;
  float n = fbm(q + 3.7) * 0.8 + (1.0 - uv.y) * 0.2;
  float th = progress * 1.35 - 0.2;
  float m = 1.0 - smoothstep(th - 0.02, th + 0.02, n);
  float e = 1.0 - smoothstep(0.0, 0.07, abs(n - th));
  float charA = (1.0 - smoothstep(th, th + 0.12, n)) * (1.0 - m);
  vec3 a = getFromColor(uv).rgb * (1.0 - 0.75 * charA);
  vec3 b = getToColor(uv).rgb;
  vec3 c = mix(a, b, m);
  c += e * vec3(1.0, 0.45, 0.08) * 1.6 * step(0.001, progress) * step(progress, 0.999);
  c += pow(e, 3.0) * vec3(1.0, 0.9, 0.6);
  return vec4(c, 1.0);
}`,

  glitch: `
vec4 transition(vec2 uv) {
  float k = sin(3.14159265 * progress);
  float t = floor(progress * 24.0);
  float row = floor(uv.y * 28.0);
  float r = hash12(vec2(row, t));
  float shift = (r - 0.5) * 0.18 * k * step(0.55, r);
  float r2 = hash12(vec2(floor(uv.y * 7.0), t + 13.0));
  shift += (r2 - 0.5) * 0.06 * k;
  vec2 q = vec2(uv.x + shift, uv.y);
  float sel = step(0.5, progress + (hash12(vec2(row, t + 5.0)) - 0.5) * 0.5 * k);
  float ca = 0.012 * k;
  vec3 c;
  if (sel < 0.5) c = vec3(fromL0(q + vec2(ca, 0.0)).r, fromL0(q).g, fromL0(q - vec2(ca, 0.0)).b);
  else c = vec3(toL0(q + vec2(ca, 0.0)).r, toL0(q).g, toL0(q - vec2(ca, 0.0)).b);
  float scan = 0.92 + 0.08 * sin(uv.y * uRes.y * 1.5);
  c *= mix(1.0, scan, k);
  return vec4(c, 1.0);
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
// 분기/루프 안에서 쓰는 샘플링: 암시적 LOD 미정의 동작을 피하려고 명시적 LOD 0 사용
vec4 fromL0(vec2 uv) { return lookColor(textureLod(uFrom, uv, 0.0), uFromLook); }
vec4 toL0(vec2 uv) { return lookColor(textureLod(uTo, uv, 0.0), uToLook); }
vec4 getToColor(vec2 uv) { return getColor(uTo, uv, uToLook); }
`;

const FOOTER = /* glsl */ `
void main() {
  vec4 c = transition(vUv);
  vec3 col = c.rgb;
  vec2 asp = vec2(ratio, 1.0);
  float d = length((vUv - 0.5) * asp) / length(vec2(0.5) * asp);
  col *= mix(1.0, 1.0 - smoothstep(0.35, 1.15, d), uVignette);
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
