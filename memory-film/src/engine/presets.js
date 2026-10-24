// 디자인 프리셋: 컬러 테마, 타이포그래피, 룩(색보정), 전환 스타일, 기본 프로젝트

export const THEMES = {
  noir: {
    name: '블랙 & 골드',
    desc: '가장 격식 있는 기념식 톤',
    dark: true,
    bg: ['#060504', '#17130d'],
    text: '#f7f0e1',
    textDim: 'rgba(247,240,225,0.74)',
    accent: ['#6e4e17', '#b8903d', '#e6c977', '#fff3cf', '#d2ac57', '#7f5c1f'],
    accentSolid: '#d9b867',
    particle: '#f0cf82',
    scrim: 'rgba(4,3,2,',
  },
  navy: {
    name: '네이비 & 샴페인',
    desc: '신뢰감 있는 기업 행사 톤',
    dark: true,
    bg: ['#050b16', '#12223a'],
    text: '#f3efe7',
    textDim: 'rgba(243,239,231,0.74)',
    accent: ['#7a6440', '#c8b07f', '#ecdcb6', '#fffaf0', '#d3bd8f', '#806a45'],
    accentSolid: '#dcc79b',
    particle: '#f2e3bf',
    scrim: 'rgba(3,7,14,',
  },
  burgundy: {
    name: '버건디 & 골드',
    desc: '따뜻하고 감성적인 축하 톤',
    dark: true,
    bg: ['#12040a', '#33101b'],
    text: '#f8eee6',
    textDim: 'rgba(248,238,230,0.74)',
    accent: ['#73501d', '#bf9446', '#ebcd85', '#fff2d2', '#d3a958', '#7c561d'],
    accentSolid: '#e0bd73',
    particle: '#f4cf8c',
    scrim: 'rgba(14,3,7,',
  },
  ivory: {
    name: '아이보리 & 브라운',
    desc: '밝고 깨끗한 모던 톤',
    dark: false,
    bg: ['#fbf7ef', '#ece1cd'],
    text: '#2a2016',
    textDim: 'rgba(42,32,22,0.72)',
    accent: ['#5a3d11', '#94692a', '#c49a50', '#d9b56d', '#9a6e2c', '#5a3d11'],
    accentSolid: '#9b7232',
    particle: '#c9a05a',
    scrim: 'rgba(20,14,8,',
  },
};

const KR_FALLBACK = '"Noto Serif KR", "Pretendard Variable", serif';

export const TYPOGRAPHY = {
  classic: {
    name: '클래식 명조',
    desc: 'Bodoni + 본명조',
    display: { family: 'Bodoni Moda', weight: 500 },
    eyebrow: { family: 'Cormorant Garamond', weight: 600 },
    title: { family: 'Noto Serif KR', weight: 600 },
    body: { family: 'Noto Serif KR', weight: 400 },
  },
  modern: {
    name: '모던 고딕',
    desc: 'Pretendard 단일 패밀리',
    display: { family: 'Pretendard Variable', weight: 200 },
    eyebrow: { family: 'Pretendard Variable', weight: 500 },
    title: { family: 'Pretendard Variable', weight: 700 },
    body: { family: 'Pretendard Variable', weight: 400 },
  },
  royal: {
    name: '로열 클래식',
    desc: 'Cinzel + 나눔명조',
    display: { family: 'Cinzel', weight: 600 },
    eyebrow: { family: 'Cinzel', weight: 600 },
    title: { family: 'Nanum Myeongjo', weight: 800 },
    body: { family: 'Nanum Myeongjo', weight: 400 },
  },
  warm: {
    name: '감성 바탕',
    desc: 'Gilda + 고운바탕',
    display: { family: 'Gilda Display', weight: 400 },
    eyebrow: { family: 'Playfair Display', weight: 500 },
    title: { family: 'Gowun Batang', weight: 700 },
    body: { family: 'Gowun Batang', weight: 400 },
  },
};

export function fontStr(spec, sizePx, weightOverride) {
  const w = weightOverride ?? spec.weight;
  return `${w} ${Math.max(1, sizePx).toFixed(2)}px "${spec.family}", ${KR_FALLBACK}`;
}

// 사진 색보정 룩 (텍스트 화면에는 적용하지 않음)
export const LOOKS = {
  natural: { name: '자연스럽게', warmth: 0, sat: 1, contrast: 0.04, lift: 0, fade: 0 },
  warm: { name: '따뜻한 필름', warmth: 0.45, sat: 0.96, contrast: 0.12, lift: 0.015, fade: 0 },
  vintage: { name: '빈티지 메모리', warmth: 0.7, sat: 0.78, contrast: 0.08, lift: 0.06, fade: 0.04 },
  vivid: { name: '선명하게', warmth: 0.1, sat: 1.12, contrast: 0.14, lift: 0, fade: 0 },
  mono: { name: '흑백 클래식', warmth: 0.08, sat: 0, contrast: 0.2, lift: 0.02, fade: 0 },
};

export const TRANSITION_STYLES = {
  elegant: {
    name: '우아하게',
    desc: '부드러운 디졸브 중심 · 기념식 추천',
    pool: [['fade', 3], ['blurDissolve', 3], ['lumaReveal', 2], ['lightLeak', 2], ['softWipe', 1.2], ['morph', 1.2], ['iris', 0.6], ['dipWhite', 0.5]],
  },
  cinematic: {
    name: '시네마틱',
    desc: '빛번짐 · 줌 · 필름 느낌',
    pool: [['lightLeak', 3], ['zoomBlur', 2], ['blurDissolve', 2], ['dipBlack', 1], ['iris', 1], ['morph', 1], ['softWipe', 1], ['lumaReveal', 1]],
  },
  dynamic: {
    name: '경쾌하게',
    desc: '슬라이드 · 워프 · 리듬감',
    pool: [['zoomBlur', 2], ['slide', 2], ['crosswarp', 2], ['softWipe', 1.2], ['iris', 1], ['lightLeak', 1], ['ripple', 0.8], ['swirl', 0.6]],
  },
};

export const MOTION_LEVELS = { none: 0, subtle: 0.55, normal: 1, strong: 1.6 };

export const RESOLUTIONS = {
  '720p': { w: 1280, h: 720, label: 'HD 720p', bitrate: 8 },
  '1080p': { w: 1920, h: 1080, label: 'Full HD 1080p (권장)', bitrate: 16 },
  '1440p': { w: 2560, h: 1440, label: 'QHD 1440p', bitrate: 28 },
  '2160p': { w: 3840, h: 2160, label: '4K UHD', bitrate: 50 },
};

export const QUALITY = {
  standard: { name: '표준', crf: 21, preset: 'fast' },
  high: { name: '고화질 (권장)', crf: 18, preset: 'medium' },
  best: { name: '최고화질', crf: 15, preset: 'slow' },
};

export function newId(prefix = 'i') {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function defaultProject() {
  const year = new Date().getFullYear();
  return {
    version: 1,
    name: '30주년 기념영상',
    text: {
      number: '30',
      eyebrow: 'ANNIVERSARY',
      title: '함께 걸어온 30년',
      subtitle: `${year - 30} — ${year}`,
      org: '',
      startYear: year - 30,
      endYear: year,
      closingTitle: '감사합니다',
      closingMessage: '지난 30년, 함께해 주신 모든 분께\n진심으로 감사드립니다.',
      closingSub: '앞으로의 30년도 함께하겠습니다',
    },
    intro: { enabled: true, style: 'golden', duration: 10 },
    outro: { enabled: true, duration: 10 },
    style: {
      theme: 'noir',
      typography: 'classic',
      transitionStyle: 'elegant',
      transitionDuration: 1.3,
      photoDuration: 4.5,
      motion: 'normal',
      fit: 'auto',
      look: 'warm',
      vignette: 0.35,
      grain: 0.22,
      photoFrame: false,
      seed: 1,
    },
    music: { tracks: [], volume: 0.9, fadeIn: 1.5, fadeOut: 5, crossfade: 3, loop: true },
    output: { resolution: '1080p', fps: 30, quality: 'high', path: '' },
    items: [],
  };
}

/** 저장 파일 / 이전 버전 호환: 누락된 필드를 기본값으로 채움 */
export function normalizeProject(p) {
  const d = defaultProject();
  const out = { ...d, ...p };
  for (const k of ['text', 'intro', 'outro', 'style', 'music', 'output']) out[k] = { ...d[k], ...(p?.[k] || {}) };
  out.items = Array.isArray(p?.items) ? p.items : [];
  out.music.tracks = Array.isArray(out.music.tracks) ? out.music.tracks : [];
  return out;
}
