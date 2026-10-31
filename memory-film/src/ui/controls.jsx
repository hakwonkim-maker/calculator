// 공통 UI 컨트롤
import React from 'react';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
const paths = {
  photo: <><rect x="3" y="5" width="18" height="14" rx="2" {...P} /><circle cx="9" cy="10" r="1.8" {...P} /><path d="M21 16l-5-5-8 8" {...P} /></>,
  text: <><path d="M5 6h14M12 6v13M8.5 19h7" {...P} /></>,
  palette: <><path d="M12 3a9 9 0 100 18c1.2 0 1.8-.9 1.8-1.8 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6H17a4 4 0 004-4c0-4.4-4-8-9-8z" {...P} /><circle cx="7.5" cy="11" r="1" fill="currentColor" /><circle cx="10" cy="7" r="1" fill="currentColor" /><circle cx="15" cy="7.5" r="1" fill="currentColor" /></>,
  music: <><path d="M9 18V6l11-2v12" {...P} /><circle cx="6.5" cy="18" r="2.5" {...P} /><circle cx="17.5" cy="16" r="2.5" {...P} /></>,
  export: <><path d="M12 15V3M7 8l5-5 5 5" {...P} /><path d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" {...P} /></>,
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" /></>,
  back: <path d="M6 5v14M19 5L9 12l10 7z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />,
  folder: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" {...P} />,
  plus: <path d="M12 5v14M5 12h14" {...P} />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" {...P} /></>,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" {...P} />,
  redo: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" {...P} />,
  save: <><path d="M5 3h11l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 011-2z" {...P} /><path d="M8 3v5h7M8 21v-7h8v7" {...P} /></>,
  open: <><path d="M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v1" {...P} /><path d="M3 19l3-8h16l-3 8z" {...P} /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" {...P} />,
  shuffle: <path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.6 0 2.8-1.6 3.8-3.6M21 7h-5c-1.6 0-2.8 1.6-3.8 3.6M18 4l3 3-3 3M18 14l3 3-3 3" {...P} />,
  chapter: <><rect x="3" y="5" width="18" height="14" rx="2" {...P} /><path d="M8 10h8M9.5 14h5" {...P} /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" {...P} />,
  warn: <><path d="M12 3l9.5 17h-19z" {...P} /><path d="M12 10v4.5M12 17.5v.1" {...P} /></>,
  info: <><circle cx="12" cy="12" r="9" {...P} /><path d="M12 11v5.5M12 7.8v.1" {...P} /></>,
  x: <path d="M6 6l12 12M18 6L6 18" {...P} />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" {...P} />,
  sort: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" {...P} />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" {...P} /><path d="M3 10h18M8 3v4M16 3v4" {...P} /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2" {...P} /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" {...P} /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" {...P} /><path d="M3 16l5-5 4 4 3-3 6 6" {...P} /></>,
};

/** 입력칸 키 입력은 단축키로 넘기지 않음 — 단, Ctrl+S(저장)는 통과 */
export const keepSave = (e) => {
  if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) e.stopPropagation();
};

export function Icon({ name, size = 18, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Section({ title, hint, children, right }) {
  return (
    <section className="section">
      {(title || right) && (
        <div className="section-head">
          <h3>{title}</h3>
          {right}
        </div>
      )}
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Field({ label, children, hint, inline }) {
  return (
    <label className={'field' + (inline ? ' inline' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, maxLength, multiline, rows = 3, onFocus }) {
  const props = {
    value: value ?? '',
    placeholder,
    maxLength,
    onFocus,
    spellCheck: false,
    onChange: (e) => onChange(e.target.value),
    onKeyDown: keepSave,
  };
  return multiline ? <textarea className="input" rows={rows} {...props} /> : <input className="input" type="text" {...props} />;
}

export function Slider({ value, min, max, step = 0.1, onChange, format = (v) => v, label }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      {label && (
        <div className="slider-top">
          <span>{label}</span>
          <b>{format(value)}</b>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={keepSave}
      />
    </div>
  );
}

export function Segmented({ value, options, onChange, size }) {
  return (
    <div className={'segmented' + (size ? ' ' + size : '')}>
      {options.map(([v, label]) => (
        <button key={v} type="button" className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, desc }) {
  return (
    <button type="button" className={'toggle' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}>
      <span className="toggle-text">
        <span>{label}</span>
        {desc && <small>{desc}</small>}
      </span>
      <span className="toggle-track">
        <span className="toggle-knob" />
      </span>
    </button>
  );
}

export function Button({ icon, children, onClick, variant = 'ghost', disabled, title, size, type = 'button' }) {
  return (
    <button type={type} className={`btn btn-${variant}${size ? ' btn-' + size : ''}`} onClick={onClick} disabled={disabled} title={title}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children && <span>{children}</span>}
    </button>
  );
}
