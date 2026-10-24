// 프로젝트 상태 + 실행 취소/다시 실행 + 자동 저장
import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultProject, normalizeProject } from '../engine/presets.js';
import { isDesktop } from '../platform.js';

const AUTOSAVE_KEY = 'memoria.autosave.v1';

export function loadAutosave() {
  if (!isDesktop) return null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { project: normalizeProject(data.project), filePath: data.filePath || null, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

export function useProjectStore() {
  const [state, setState] = useState(() => {
    const auto = loadAutosave();
    return {
      project: auto?.project || defaultProject(),
      restored: !!(auto && auto.project.items.length),
      filePath: auto?.filePath || null,
      past: [],
      future: [],
      dirty: false,
    };
  });
  const last = useRef({ key: null, time: 0 });

  /** update(fn | value, coalesceKey) — 같은 key로 1.5초 안에 연속 변경 시 실행취소 1단계로 묶음 */
  const update = useCallback((fn, key) => {
    setState((s) => {
      const next = typeof fn === 'function' ? fn(s.project) : fn;
      if (!next || next === s.project) return s;
      const now = Date.now();
      const coalesce = key && key === last.current.key && now - last.current.time < 1500;
      last.current = { key, time: now };
      return { ...s, project: next, past: coalesce ? s.past : [...s.past.slice(-80), s.project], future: [], dirty: true };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { key: null, time: 0 };
    setState((s) => (s.past.length ? { ...s, project: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.project, ...s.future], dirty: true } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = { key: null, time: 0 };
    setState((s) => (s.future.length ? { ...s, project: s.future[0], future: s.future.slice(1), past: [...s.past, s.project], dirty: true } : s));
  }, []);

  const replace = useCallback((project, filePath = null) => {
    last.current = { key: null, time: 0 };
    setState({ project: normalizeProject(project), filePath, past: [], future: [], dirty: false, restored: false });
  }, []);

  const markSaved = useCallback((filePath) => setState((s) => ({ ...s, filePath, dirty: false })), []);
  const clearRestored = useCallback(() => setState((s) => ({ ...s, restored: false })), []);

  // 자동 저장 (프로그램이 갑자기 꺼져도 작업 보존)
  useEffect(() => {
    if (!isDesktop) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ project: state.project, filePath: state.filePath, savedAt: Date.now() }));
      } catch {
        /* 용량 초과 등 무시 */
      }
    }, 800);
    return () => clearTimeout(id);
  }, [state.project, state.filePath]);

  return { ...state, update, undo, redo, replace, markSaved, clearRestored };
}

// ---------- 불변 업데이트 헬퍼 ----------
export function setPath(obj, path, value) {
  const keys = path.split('.');
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

export function updateItem(project, id, patch) {
  return { ...project, items: project.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) };
}

// 사진 메타 정보(해상도, 누락 여부) — 프로젝트 히스토리와 분리된 캐시
export const photoMeta = new Map();
export const metaListeners = new Set();
export function setPhotoMeta(path, patch) {
  photoMeta.set(path, { ...(photoMeta.get(path) || {}), ...patch });
  metaListeners.forEach((fn) => fn());
}
export function useMetaVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const fn = () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        setV((x) => x + 1);
      });
    };
    metaListeners.add(fn);
    return () => metaListeners.delete(fn);
  }, []);
  return v;
}
