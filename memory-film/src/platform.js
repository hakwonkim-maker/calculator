// 데스크톱(Electron) / 웹(개발·테스트) 환경 추상화
export const api = typeof window !== 'undefined' ? window.mfApi || null : null;
export const isDesktop = !!api;

/** 로컬 파일 경로 → 렌더러에서 읽을 수 있는 URL */
export function mediaUrl(path) {
  if (!path) return '';
  if (!isDesktop || /^(blob:|data:|https?:|media:)/.test(path)) return path;
  return 'media://local/' + encodeURIComponent(path);
}

export function baseName(path) {
  return String(path || '').split(/[\\/]/).pop();
}
