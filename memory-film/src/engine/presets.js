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
  rose: {
    name: '블러시 & 로즈골드',
    desc: '웨딩·생일에 어울리는 부드러운 톤',
    dark: false,
    bg: ['#fbf1ee', '#efd9d3'],
    text: '#3b2526',
    textDim: 'rgba(59,37,38,0.7)',
    accent: ['#5e2f22', '#8f513d', '#b97a62', '#d39a82', '#9a5a45', '#5e2f22'],
    accentSolid: '#9a5a45',
    particle: '#e7a995',
    scrim: 'rgba(30,14,12,',
  },
  sage: {
    name: '세이지 그린',
    desc: '여행·자연·가족 앨범 톤',
    dark: true,
    bg: ['#0c1410', '#1f2e25'],
    text: '#f1efe6',
    textDim: 'rgba(241,239,230,0.74)',
    accent: ['#6b6a3c', '#a9a86a', '#d9d6a2', '#f6f3d6', '#b7b47a', '#706e40'],
    accentSolid: '#cfcb92',
    particle: '#e3dfa8',
    scrim: 'rgba(5,10,7,',
  },
  sky: {
    name: '스카이 블루',
    desc: '밝고 경쾌한 아이·졸업 톤',
    dark: false,
    bg: ['#f2f7fc', '#d6e6f5'],
    text: '#1d2b3d',
    textDim: 'rgba(29,43,61,0.72)',
    accent: ['#1f4f86', '#3f7fc4', '#7fb3e6', '#bcdcf7', '#4c8bcb', '#21548c'],
    accentSolid: '#3d7bbf',
    particle: '#8fc0ec',
    scrim: 'rgba(8,16,28,',
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
  romantic: {
    name: '로맨틱 스크립트',
    desc: 'Great Vibes + 고운바탕',
    display: { family: 'Great Vibes', weight: 400 },
    eyebrow: { family: 'Cormorant Garamond', weight: 600 },
    title: { family: 'Gowun Batang', weight: 700 },
    body: { family: 'Gowun Batang', weight: 400 },
  },
  playful: {
    name: '발랄한 둥근체',
    desc: 'Fredoka + 주아',
    display: { family: 'Fredoka', weight: 600 },
    eyebrow: { family: 'Fredoka', weight: 600 },
    title: { family: 'Jua', weight: 400 },
    body: { family: 'Gowun Dodum', weight: 400 },
  },
  diary: {
    name: '손글씨 다이어리',
    desc: 'Caveat + 나눔펜',
    display: { family: 'Caveat', weight: 600 },
    eyebrow: { family: 'Caveat', weight: 600 },
    title: { family: 'Nanum Pen Script', weight: 400 },
    body: { family: 'Gowun Dodum', weight: 400 },
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
    pool: [['zoomBlur', 2], ['slide', 2], ['slideUp', 1.3], ['crosswarp', 2], ['softWipe', 1.2], ['iris', 1], ['cube', 1], ['lightLeak', 1], ['ripple', 0.6]],
  },
  romantic: {
    name: '로맨틱',
    desc: '하트 · 빛번짐 · 화이트 · 웨딩 추천',
    pool: [['fade', 3], ['blurDissolve', 3], ['lumaReveal', 2], ['lightLeak', 2], ['dipWhite', 1.2], ['heart', 0.8], ['iris', 0.6]],
  },
  fun: {
    name: '신나게',
    desc: '도트 · 큐브 · 글리치 · 생일/행사',
    pool: [['dots', 1.4], ['cube', 1.5], ['slide', 1.4], ['slideUp', 1.2], ['zoomBlur', 1.5], ['glitch', 0.9], ['blinds', 1], ['swirl', 0.7], ['heart', 0.5]],
  },
  retro: {
    name: '레트로 필름',
    desc: '필름 번 · 블랙 페이드 · 추억',
    pool: [['filmBurn', 2.2], ['lightLeak', 2], ['dipBlack', 1.5], ['fade', 1.5], ['blurDissolve', 1], ['blinds', 0.6]],
  },
};

export const INTRO_STYLES = {
  golden: { name: '골든 타이틀', desc: '빛 입자 속 금빛 숫자 · 격식 있는 오프닝' },
  mosaic: { name: '메모리 모자이크', desc: '사진들이 벽처럼 펼쳐진 뒤 타이틀' },
  light: { name: '이어온 시간', desc: '연도 카운터가 흐른 뒤 타이틀' },
  cinematic: { name: '시네마 오프닝', desc: '레터박스가 열리며 영화처럼 시작' },
  polaroid: { name: '폴라로이드', desc: '인화 사진이 한 장씩 떨어지며 쌓임' },
  bloom: { name: '플로럴 블룸', desc: '꽃잎과 빛망울이 흩날리는 따뜻한 오프닝' },
  minimal: { name: '미니멀 라인', desc: '선이 그어지고 글자가 떠오르는 모던 스타일' },
  filmleader: { name: '필름 카운트다운', desc: '3·2·1 옛날 영사기 카운트다운' },
};

export const OUTRO_STYLES = {
  gallery: { name: '갤러리 월', desc: '사진이 흐르는 벽 위 감사 메시지' },
  credits: { name: '엔딩 크레딧', desc: '영화처럼 올라가는 이름 목록' },
  simple: { name: '심플', desc: '배경 위 메시지만 깔끔하게' },
};

export const MOTION_OPTIONS = [
  ['auto', '자동'],
  ['zoomIn', '확대'],
  ['zoomOut', '축소'],
  ['panLeft', '← 이동'],
  ['panRight', '→ 이동'],
  ['panUp', '↑ 이동'],
  ['panDown', '↓ 이동'],
  ['none', '고정'],
];

export const MOTION_LEVELS = { none: 0, subtle: 0.55, normal: 1, strong: 1.6 };

export const RESOLUTIONS = {
  '720p': { s: 720, label: 'HD 720p', bitrate: 8 },
  '1080p': { s: 1080, label: 'Full HD 1080p (권장)', bitrate: 16 },
  '1440p': { s: 1440, label: 'QHD 1440p', bitrate: 28 },
  '2160p': { s: 2160, label: '4K UHD', bitrate: 50 },
};

export const ASPECTS = {
  '16:9': { name: '가로 16:9', desc: '행사 스크린 · 유튜브 · TV', r: [16, 9] },
  '9:16': { name: '세로 9:16', desc: '쇼츠 · 릴스 · 스토리', r: [9, 16] },
  '1:1': { name: '정사각 1:1', desc: '인스타그램 피드', r: [1, 1] },
  '4:5': { name: '세로 4:5', desc: '인스타그램 세로 피드', r: [4, 5] },
};

const even = (x) => Math.round(x / 2) * 2;
/** 화면비 + 짧은 변 해상도 → 실제 픽셀 크기 */
export function frameSize(aspect, shortSide) {
  const [a, b] = (ASPECTS[aspect] || ASPECTS['16:9']).r;
  return a >= b ? { w: even((shortSide * a) / b), h: shortSide } : { w: shortSide, h: even((shortSide * b) / a) };
}
export function outputSize(project) {
  return frameSize(project.output.aspect, (RESOLUTIONS[project.output.resolution] || RESOLUTIONS['1080p']).s);
}

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
      credits: '',
      logo: '',
    },
    intro: { enabled: true, style: 'golden', duration: 10 },
    outro: { enabled: true, style: 'gallery', duration: 10 },
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
      captionPos: 'left',
      watermark: false,
      watermarkPos: 'tr',
      seed: 1,
    },
    music: { tracks: [], volume: 0.9, fadeIn: 1.5, fadeOut: 5, crossfade: 3, loop: true },
    output: { aspect: '16:9', resolution: '1080p', fps: 30, quality: 'high', path: '' },
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

// ---------------------------------------------------------------------------
// 영상 종류별 템플릿: 클릭 한 번으로 문구·인트로·테마·글꼴·전환을 한꺼번에 설정
// (사진과 음악은 그대로 유지)
// ---------------------------------------------------------------------------
const Y = new Date().getFullYear();
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
})();

export const TEMPLATES = {
  anniversary: {
    name: '창립·기념일',
    desc: '30주년 등 기관·회사 기념식',
    name2: '30주년 기념영상',
    text: { number: '30', eyebrow: 'ANNIVERSARY', title: '함께 걸어온 30년', subtitle: `${Y - 30} — ${Y}`, startYear: Y - 30, endYear: Y, closingTitle: '감사합니다', closingMessage: '지난 30년, 함께해 주신 모든 분께\n진심으로 감사드립니다.', closingSub: '앞으로의 30년도 함께하겠습니다' },
    intro: { style: 'golden', duration: 10 },
    outro: { style: 'gallery' },
    style: { theme: 'noir', typography: 'classic', transitionStyle: 'elegant', look: 'warm', motion: 'normal', grain: 0.22, vignette: 0.35 },
  },
  wedding: {
    name: '웨딩',
    desc: '결혼식 식전 영상 · 성장 영상',
    name2: '웨딩 영상',
    text: { number: '', eyebrow: 'Our Wedding Day', title: '민준 그리고 서연', subtitle: today, closingTitle: '감사합니다', closingMessage: '저희 두 사람의 시작을\n축복해 주셔서 감사합니다.', closingSub: '예쁘게 잘 살겠습니다' },
    intro: { style: 'bloom', duration: 11 },
    outro: { style: 'gallery' },
    style: { theme: 'rose', typography: 'romantic', transitionStyle: 'romantic', look: 'warm', motion: 'subtle', grain: 0.12, vignette: 0.25 },
  },
  birthday: {
    name: '생일·돌잔치',
    desc: '아이 성장 · 생일 축하',
    name2: '생일 축하 영상',
    text: { number: '1', eyebrow: 'HAPPY BIRTHDAY', title: '우리 아기 첫 번째 생일', subtitle: today, closingTitle: '사랑해', closingMessage: '건강하고 밝게 자라줘서 고마워.\n앞으로도 늘 함께할게.', closingSub: '생일 축하해!' },
    intro: { style: 'bloom', duration: 10 },
    outro: { style: 'gallery' },
    style: { theme: 'sky', typography: 'playful', transitionStyle: 'fun', look: 'vivid', motion: 'normal', grain: 0.08, vignette: 0.2 },
  },
  graduation: {
    name: '졸업·입학',
    desc: '졸업식 · 학교 행사',
    name2: '졸업 축하 영상',
    text: { number: String(Y), eyebrow: 'GRADUATION', title: '빛나는 졸업을 축하합니다', subtitle: '○○고등학교 제00회 졸업식', closingTitle: '졸업을 축하합니다', closingMessage: '함께한 모든 순간이\n우리의 자랑입니다.', closingSub: '새로운 시작을 응원합니다' },
    intro: { style: 'cinematic', duration: 10 },
    outro: { style: 'credits' },
    style: { theme: 'navy', typography: 'royal', transitionStyle: 'cinematic', look: 'natural', motion: 'normal', grain: 0.15, vignette: 0.35 },
  },
  travel: {
    name: '여행 앨범',
    desc: '여행 기록 · 브이로그',
    name2: '여행 영상',
    text: { number: '', eyebrow: 'Travel Diary', title: '제주, 우리의 여름', subtitle: '2026. 07. 21 — 07. 25', closingTitle: '또 떠나자', closingMessage: '함께라서 더 좋았던\n우리의 여행', closingSub: 'see you next trip' },
    intro: { style: 'polaroid', duration: 10 },
    outro: { style: 'gallery' },
    style: { theme: 'sage', typography: 'diary', transitionStyle: 'dynamic', look: 'vivid', motion: 'strong', grain: 0.15, vignette: 0.3 },
  },
  family: {
    name: '가족 앨범',
    desc: '부모님 칠순 · 가족 추억',
    name2: '가족 추억 영상',
    text: { number: '70', eyebrow: 'HAPPY 70TH BIRTHDAY', title: '사랑하는 어머니의 칠순을 축하드립니다', subtitle: today, closingTitle: '사랑합니다', closingMessage: '언제나 저희 곁에 있어 주셔서\n감사합니다.', closingSub: '건강하게 오래오래 함께해요' },
    intro: { style: 'filmleader', duration: 11 },
    outro: { style: 'gallery' },
    style: { theme: 'ivory', typography: 'warm', transitionStyle: 'retro', look: 'vintage', motion: 'subtle', grain: 0.3, vignette: 0.4 },
  },
  memorial: {
    name: '추모·헌정',
    desc: '추모식 · 공로 헌정',
    name2: '추모 영상',
    text: { number: '', eyebrow: 'IN LOVING MEMORY', title: '그리운 당신을 기억하며', subtitle: '1948 — 2026', closingTitle: '고맙습니다', closingMessage: '당신과 함께한 모든 날을\n오래도록 기억하겠습니다.', closingSub: '' },
    intro: { style: 'minimal', duration: 10 },
    outro: { style: 'simple' },
    style: { theme: 'noir', typography: 'classic', transitionStyle: 'elegant', look: 'mono', motion: 'subtle', grain: 0.2, vignette: 0.45 },
  },
  event: {
    name: '행사 하이라이트',
    desc: '워크숍 · 체육대회 · 송년회',
    name2: '행사 하이라이트',
    text: { number: String(Y), eyebrow: 'EVENT HIGHLIGHTS', title: '함께해서 즐거웠던 하루', subtitle: '○○○ 워크숍', closingTitle: '수고하셨습니다', closingMessage: '함께해 주신 모든 분들께\n감사드립니다.', closingSub: '내년에 또 만나요', credits: '# 함께한 사람들\n기획\t홍길동\n진행\t김철수\n촬영\t이영희' },
    intro: { style: 'minimal', duration: 9 },
    outro: { style: 'credits' },
    style: { theme: 'navy', typography: 'modern', transitionStyle: 'fun', look: 'vivid', motion: 'strong', grain: 0.08, vignette: 0.25 },
  },
  yearend: {
    name: '연말 결산',
    desc: '올해의 순간 · 송년 영상',
    name2: `${Y} 연말 결산`,
    text: { number: String(Y), eyebrow: 'YEAR IN REVIEW', title: '올 한 해, 함께해서 고마웠습니다', subtitle: `${Y}. 01 — ${Y}. 12`, startYear: Y - 1, endYear: Y, closingTitle: '고맙습니다', closingMessage: '함께 만든 모든 순간이\n우리의 한 해였습니다.', closingSub: `Happy New Year ${Y + 1}` },
    intro: { style: 'mosaic', duration: 10 },
    outro: { style: 'gallery' },
    style: { theme: 'burgundy', typography: 'classic', transitionStyle: 'cinematic', look: 'warm', motion: 'normal', grain: 0.2, vignette: 0.35 },
  },
};

export function applyTemplate(project, id) {
  const t = TEMPLATES[id];
  if (!t) return project;
  const d = defaultProject();
  return {
    ...project,
    name: project.items.length && project.name !== d.name ? project.name : t.name2,
    template: id,
    text: { ...d.text, credits: '', ...t.text, org: project.text.org, logo: project.text.logo },
    intro: { ...project.intro, enabled: true, transition: 'auto', ...t.intro },
    outro: { ...project.outro, enabled: true, ...t.outro },
    style: { ...project.style, ...t.style },
  };
}
