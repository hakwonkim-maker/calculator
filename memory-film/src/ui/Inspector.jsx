// 우측 인스펙터: 선택한 사진/챕터 속성 편집, 미선택 시 프로젝트 요약
import React from 'react';
import { Section, Field, TextInput, Slider, Segmented, Button, Icon } from './controls.jsx';
import { Thumb } from './Filmstrip.jsx';
import { TRANSITIONS } from '../engine/transitions.js';
import { CHAPTER_DEFAULT_DURATION } from '../engine/timeline.js';
import { MOTION_OPTIONS } from '../engine/presets.js';
import { photoMeta, updateItem, useMetaVersion } from './store.js';
import { isLowRes, photoDims, checklist } from './logic.js';
import { fmtTime } from '../engine/math.js';
import { baseName } from '../platform.js';

function TransitionSelect({ value, onChange }) {
  return (
    <select className="input" value={value || 'auto'} onChange={(e) => onChange(e.target.value)}>
      <option value="auto">자동 (스타일에 맞게)</option>
      {Object.entries(TRANSITIONS).map(([id, t]) => (
        <option key={id} value={id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export function Inspector({ project, update, tl, selected, actions, onSelectIds }) {
  useMetaVersion();
  const ids = [...selected];
  const T = project.style.transitionDuration;

  if (ids.length > 1) {
    const sel = project.items.filter((i) => selected.has(i.id));
    return (
      <div className="inspector">
        <Section title={`${sel.length}개 선택됨`} hint="Shift·Ctrl 클릭으로 여러 장을 선택할 수 있습니다.">
          <Field label="다음 전환 일괄 변경">
            <TransitionSelect value="auto" onChange={(v) => update((p) => ({ ...p, items: p.items.map((i) => (selected.has(i.id) ? { ...i, transition: v } : i)) }))} />
          </Field>
          <Field label="화면 맞춤 일괄 변경">
            <Segmented value="" onChange={(v) => update((p) => ({ ...p, items: p.items.map((i) => (selected.has(i.id) ? { ...i, fit: v } : i)) }))} options={[['auto', '자동'], ['cover', '꽉'], ['contain', '전체']]} size="sm" />
          </Field>
          <Button icon="trash" variant="danger" onClick={actions.deleteSelected}>
            선택 항목 삭제
          </Button>
        </Section>
      </div>
    );
  }

  const id = ids[0];
  if (id === 'intro' || id === 'outro') {
    return (
      <div className="inspector">
        <Section title={id === 'intro' ? '인트로' : '엔딩'} hint="문구와 스타일은 왼쪽 ‘문구’ 단계에서 편집합니다.">
          <Button icon="text" variant="soft" onClick={() => actions.goStep('text')}>
            문구 편집하기
          </Button>
        </Section>
      </div>
    );
  }

  const item = project.items.find((i) => i.id === id);
  if (!item) return <Summary project={project} tl={tl} onSelectIds={onSelectIds} />;
  const set = (k) => (v) => update((p) => updateItem(p, item.id, { [k]: v }), item.id + k);

  if (item.type === 'chapter') {
    return (
      <div className="inspector">
        <Section title="챕터 카드" hint="시대·주제가 바뀌는 지점에 넣으면 이야기 흐름이 살아납니다.">
          <Field label="큰 제목">
            <TextInput value={item.title} onChange={set('title')} placeholder="1996" maxLength={20} />
          </Field>
          <Field label="부제">
            <TextInput value={item.subtitle} onChange={set('subtitle')} placeholder="작은 시작, 큰 꿈" maxLength={36} />
          </Field>
          <Slider label="표시 시간" value={item.duration || CHAPTER_DEFAULT_DURATION} min={2.5} max={8} step={0.1} format={(v) => `${v.toFixed(1)}초`} onChange={set('duration')} />
          <Field label="다음 장면 전환">
            <TransitionSelect value={item.transition} onChange={set('transition')} />
          </Field>
          <Button icon="trash" variant="danger" onClick={actions.deleteSelected}>
            챕터 삭제
          </Button>
        </Section>
      </div>
    );
  }

  const meta = { ...(photoMeta.get(item.path) || {}), ...(photoDims(item) || {}) };
  const rot = Number(item.rotate) || 0;
  const rotate = (d) => update((p) => updateItem(p, item.id, { rotate: (((rot + d) % 360) + 360) % 360, focus: undefined }));
  const low = isLowRes(item);
  const date = item.date ? new Date(item.date) : null;
  return (
    <div className="inspector">
      <FocusPicker item={item} meta={meta} rot={rot} onPick={(f) => update((p) => updateItem(p, item.id, { focus: f }))} />
      <div className="insp-tools">
        <Button icon="undo" size="sm" variant="soft" onClick={() => rotate(-90)} title="왼쪽으로 90° 회전">
          회전
        </Button>
        <Button icon="redo" size="sm" variant="soft" onClick={() => rotate(90)} title="오른쪽으로 90° 회전">
          회전
        </Button>
        {item.focus && (
          <button className="link" onClick={() => update((p) => updateItem(p, item.id, { focus: undefined }))}>
            중심점 해제
          </button>
        )}
      </div>
      <div className="insp-meta">
        <b title={item.path}>{item.name || baseName(item.path)}</b>
        <span>
          {meta.w ? `${meta.w}×${meta.h}` : ''}
          {date && ` · ${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`}
          {date && item.dateSource !== 'exif' && ' (파일 날짜)'}
        </span>
        {low && (
          <span className="warn-line">
            <Icon name="warn" size={13} /> 해상도가 낮아 큰 화면에서 흐릴 수 있습니다
          </span>
        )}
        {meta.missing && (
          <span className="warn-line err">
            <Icon name="warn" size={13} /> 원본 파일을 찾을 수 없습니다
          </span>
        )}
      </div>
      <Section title="자막">
        <Field label="연도 · 라벨" hint="금색 큰 글씨로 표시 (예: 1998, 창립)">
          <TextInput value={item.label} onChange={set('label')} placeholder="1998" maxLength={20} />
        </Field>
        <Field label="설명">
          <TextInput value={item.caption} onChange={set('caption')} placeholder="예) 본사 이전 기념 단체사진" maxLength={60} />
        </Field>
      </Section>
      <Section title="표시">
        <Field label="화면 맞춤">
          <Segmented value={item.fit || 'auto'} onChange={set('fit')} options={[['auto', '자동'], ['cover', '꽉 채우기'], ['contain', '전체']]} size="sm" />
        </Field>
        <Slider
          label={item.duration ? '표시 시간 (개별)' : '표시 시간 (기본값 사용 중)'}
          value={item.duration || tl.photoDuration || project.style.photoDuration}
          min={1.5}
          max={15}
          step={0.1}
          format={(v) => `${v.toFixed(1)}초`}
          onChange={set('duration')}
        />
        {item.duration ? (
          <button className="link" onClick={() => update((p) => updateItem(p, item.id, { duration: undefined }))}>
            기본값({(tl.photoDuration || project.style.photoDuration).toFixed(1)}초)으로 되돌리기
          </button>
        ) : null}
        <Field label="카메라 움직임">
          <div className="chip-row tight">
            {MOTION_OPTIONS.map(([id, label]) => (
              <button key={id} className={'chip' + ((item.motion || 'auto') === id ? ' on' : '')} onClick={() => update((p) => updateItem(p, item.id, { motion: id }))}>
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="다음 장면 전환">
          <TransitionSelect value={item.transition} onChange={set('transition')} />
        </Field>
        <p className="hint small">전환 시간 {T.toFixed(1)}초 · ‘스타일’ 단계에서 일괄 조정</p>
      </Section>
      <div className="btn-row">
        <Button icon="chapter" variant="soft" size="sm" onClick={() => actions.addChapter(item.id, true)}>
          앞에 챕터 넣기
        </Button>
        <Button icon="trash" variant="danger" size="sm" onClick={actions.deleteSelected}>
          삭제
        </Button>
      </div>
    </div>
  );
}

/** 사진을 클릭해 화면 중심점(초점) 지정 — 꽉 채우기 화면에서 잘리지 않을 부분 */
function FocusPicker({ item, meta, rot, onPick }) {
  const swap = rot === 90 || rot === 270;
  const ar = meta.w ? (swap ? meta.h / meta.w : meta.w / meta.h) : 1.5;
  const onClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPick({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  return (
    <div className="insp-thumb" title="사진에서 꼭 보여야 할 곳(얼굴 등)을 클릭하세요">
      <div className="focus-box" style={{ aspectRatio: ar, width: `min(100%, ${Math.round(220 * ar)}px)` }} onClick={onClick}>
        <Thumb path={item.path} rotate={rot} className="insp-img" />
        {item.focus && <span className="focus-dot" style={{ left: `${item.focus.x * 100}%`, top: `${item.focus.y * 100}%` }} />}
      </div>
      <span className="focus-hint">{item.focus ? '중심점 지정됨' : '클릭해서 중심점 지정'}</span>
    </div>
  );
}

function Summary({ project, tl, onSelectIds }) {
  const photos = project.items.filter((i) => i.type === 'photo').length;
  const checks = checklist(project, tl);
  return (
    <div className="inspector">
      <Section title="프로젝트 요약">
        <div className="summary">
          <div>
            <span>전체 길이</span>
            <b>{fmtTime(tl.total)}</b>
          </div>
          <div>
            <span>사진</span>
            <b>{photos}장</b>
          </div>
          <div>
            <span>장면</span>
            <b>{tl.segments.length}개</b>
          </div>
          <div>
            <span>음악</span>
            <b>{project.music.tracks.length}곡</b>
          </div>
        </div>
      </Section>
      <Section title="점검">
        <div className="checks">
          {checks.map((c, i) => (
            <div key={i} className={'check ' + c.level} onClick={() => c.ids && onSelectIds(c.ids)} style={{ cursor: c.ids ? 'pointer' : 'default' }}>
              <Icon name={c.level === 'ok' ? 'check' : c.level === 'info' ? 'info' : 'warn'} size={15} />
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="단축키">
        <div className="keys">
          <span><kbd>Space</kbd> 재생/정지</span>
          <span><kbd>←</kbd><kbd>→</kbd> 이전/다음 장면</span>
          <span><kbd>Delete</kbd> 선택 삭제</span>
          <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> 실행 취소</span>
          <span><kbd>Ctrl</kbd>+<kbd>S</kbd> 프로젝트 저장</span>
        </div>
      </Section>
    </div>
  );
}
