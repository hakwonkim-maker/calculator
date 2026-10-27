// 좌측 단계별 설정 패널 — 모든 선택은 카드 클릭 한 번으로 적용
import React, { useEffect, useRef, useState } from 'react';
import { Section, Field, TextInput, Slider, Segmented, Toggle, Button, Icon } from './controls.jsx';
import {
  THEMES, TYPOGRAPHY, LOOKS, TRANSITION_STYLES, RESOLUTIONS, QUALITY, INTRO_STYLES, OUTRO_STYLES, ASPECTS, TEMPLATES,
  frameSize, outputSize, applyTemplate, introTiming, MONTAGE_FREQ,
} from '../engine/presets.js';
import { fitPhotoDurationToLength, minimumLength } from '../engine/timeline.js';
import { planSelection } from '../engine/select.js';
import { fmtTime } from '../engine/math.js';
import { setPath } from './store.js';
import { sortPhotos, shufflePhotos, autoChapters, autoYearLabels, musicLength, checklist, estimateSizeMB, hasKnownYear } from './logic.js';
import { isDesktop, baseName, api, mediaUrl } from '../platform.js';
import { useThumb } from './thumbs.js';
import { estimateExportSeconds } from './ExportModal.jsx';

const fmtSec = (v) => `${Number(v).toFixed(1)}초`;

/** 실제 렌더 썸네일이 있는 선택 카드 */
function PreviewCard({ project, kind, on, title, desc, onClick, badge }) {
  const src = useThumb(project, kind);
  return (
    <button className={'pcard' + (on ? ' on' : '')} onClick={onClick}>
      <span className="pcard-img">
        {src ? <img src={src} alt="" /> : <span className="thumb-loading" />}
        {on && (
          <span className="pcard-check">
            <Icon name="check" size={13} />
          </span>
        )}
        {badge && <span className="pcard-badge">{badge}</span>}
      </span>
      <b>{title}</b>
      {desc && <small>{desc}</small>}
    </button>
  );
}

// ---------------------------------------------------------------- 템플릿 갤러리 (모달)
export function TemplateGallery({ project, onApply, onClose }) {
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal tpl-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tpl-head">
          <div>
            <div className="modal-title">어떤 영상을 만드시나요?</div>
            <p className="hint">고르면 인트로·문구·색감·글꼴·전환이 한 번에 맞춰집니다. 불러온 사진과 음악은 그대로 유지되고, 이후 자유롭게 바꿀 수 있습니다.</p>
          </div>
          <Button icon="x" onClick={onClose} title="닫기" />
        </div>
        <div className="tpl-grid">
          {Object.entries(TEMPLATES).map(([id, t]) => (
            <PreviewCard key={id} project={applyTemplate(project, id)} kind="intro" on={project.template === id} title={t.name} desc={t.desc} onClick={() => onApply(id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 1. 사진
export function PhotosPanel({ project, update, tl, actions, toast, onSelectIds }) {
  const [recursive, setRecursive] = useState(true);
  const photos = project.items.filter((i) => i.type === 'photo');
  const exifCount = photos.filter(hasKnownYear).length;
  const guessCount = photos.filter((p) => p.dateSource === 'name' || p.dateSource === 'folder').length;
  const fileDateCount = photos.filter((p) => !hasKnownYear(p)).length;
  const chapters = project.items.filter((i) => i.type === 'chapter').length;
  return (
    <>
      <Section title="사진 불러오기" hint="폴더를 선택하면 안의 사진을 촬영일 순서로 가져옵니다. 사진·폴더를 창에 끌어다 놓아도 됩니다.">
        <div className="import-grid">
          <button className="import-btn primary" onClick={() => actions.importFolder(recursive)}>
            <Icon name="folder" size={26} />
            <b>폴더 선택</b>
            <small>폴더 안 사진 전체</small>
          </button>
          <button className="import-btn" onClick={actions.importFiles}>
            <Icon name="image" size={26} />
            <b>사진 선택</b>
            <small>원하는 사진만</small>
          </button>
        </div>
        {isDesktop && <Toggle checked={recursive} onChange={setRecursive} label="하위 폴더 포함" desc="연도별로 폴더가 나뉘어 있을 때" />}
        <div className="stat-row">
          <div>
            <b>{photos.some((p) => p.skip) ? `${photos.filter((p) => !p.skip).length}/${photos.length}` : photos.length}</b>
            <span>{photos.some((p) => p.skip) ? '사용 / 전체 사진' : '사진'}</span>
          </div>
          <div>
            <b>{chapters}</b>
            <span>챕터</span>
          </div>
          <div>
            <b>{fmtTime(tl.total)}</b>
            <span>전체 길이</span>
          </div>
        </div>
      </Section>

      <LengthSection project={project} update={update} tl={tl} actions={actions} />

      <Section title="순서 정리" hint="정렬은 챕터 카드 사이 구간별로 적용되어 챕터 구성이 유지됩니다.">
        <div className="btn-row">
          <Button icon="calendar" variant="soft" size="sm" disabled={!photos.length} onClick={actions.sortByDate}>
            촬영일순
          </Button>
          <Button icon="sort" variant="soft" size="sm" disabled={!photos.length} onClick={() => { update((p) => sortPhotos(p, 'name')); toast('파일 이름 순으로 정렬했습니다'); }}>
            파일명순
          </Button>
          <Button variant="soft" size="sm" disabled={!photos.length} onClick={() => update((p) => ({ ...p, items: p.items.slice().reverse() }))}>
            역순
          </Button>
          <Button icon="shuffle" variant="soft" size="sm" disabled={!photos.length} onClick={() => { update((p) => shufflePhotos(p)); toast('사진 순서를 무작위로 섞었습니다'); }}>
            섞기
          </Button>
        </div>
        {fileDateCount > 0 && (
          <p className="hint small">
            촬영일 정보가 없는 사진 {fileDateCount}장은 파일 날짜(복사·스캔한 날)로 정렬되어 순서가 어긋날 수 있습니다. 폴더 이름에 연도를 넣거나(예: <b>1999_창립식</b>) 필름스트립에서 끌어 옮겨 주세요.{' '}
            <button className="link" onClick={() => onSelectIds(photos.filter((p) => !hasKnownYear(p)).map((p) => p.id))}>
              해당 사진 보기
            </button>
          </p>
        )}
      </Section>

      <Section title="스토리 자동 구성" hint={exifCount ? `연도를 알 수 있는 사진 ${exifCount}장을 기준으로 만듭니다${guessCount ? ` (이 중 ${guessCount}장은 폴더·파일 이름의 연도 사용)` : ''}.` : '촬영일 정보가 있거나 폴더·파일 이름에 연도(예: 1999_창립식)가 있는 사진에 적용됩니다.'}>
        <div className="stack">
          <Button icon="chapter" variant="soft" disabled={!exifCount} onClick={() => { update((p) => autoChapters(p)); toast('연도가 바뀌는 지점에 챕터 카드를 넣었습니다'); }}>
            연도별 챕터 카드 자동 생성
          </Button>
          <Button
            icon="calendar"
            variant="soft"
            disabled={!exifCount}
            onClick={() => {
              const r = autoYearLabels(project);
              update(r.project);
              toast(`사진 ${r.count}장에 연도 라벨을 넣었습니다`);
            }}
          >
            사진에 촬영 연도 표시
          </Button>
          <Button icon="plus" variant="soft" onClick={() => actions.addChapter()}>
            챕터(텍스트) 카드 추가
          </Button>
        </div>
      </Section>

      <Section title="사진 표시">
        <Field label="화면 맞춤">
          <Segmented value={project.style.fit} onChange={(v) => update((p) => setPath(p, 'style.fit', v))} options={[['auto', '자동'], ['cover', '꽉 채우기'], ['contain', '전체 보이기']]} />
        </Field>
        <p className="hint small">자동: 화면 비율과 비슷한 사진은 꽉 채우고, 세로·정사각 사진은 잘리지 않게 흐린 배경 위에 보여줍니다.</p>
        <Toggle checked={project.style.photoFrame} onChange={(v) => update((p) => setPath(p, 'style.photoFrame', v))} label="인화지 테두리" desc="전체 보이기 사진에 흰 테두리 (옛날 사진 느낌)" />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- 영상 길이
/** 자동 사진 선별: 목표 길이에 맞춰 좋은 사진만 골라 1장당 여유 있게 */
function AutoSelect({ project, actions, target }) {
  const [per, setPer] = useState(3);
  const all = project.items.filter((i) => i.type === 'photo');
  const used = all.filter((i) => !i.skip).length;
  const plan = React.useMemo(() => (all.length > 1 ? planSelection(project, target, per) : null), [project.items, project.style, project.intro, project.outro, target, per]);
  if (!plan) return null;
  const skipped = all.length - used;
  return (
    <div className="autosel">
      <div className="autosel-head">
        <b>
          <Icon name="sparkle" size={14} /> 자동 사진 선별
        </b>
        {skipped > 0 && <span className="autosel-state">{all.length}장 중 {used}장 사용 중</span>}
      </div>
      <p className="hint small">
        좋은 사진만 골라 1장당 여유 있게 보여 줍니다. ★대표·자막 사진은 항상 넣고, 흔들린·어두운 사진과 연속 촬영 중복은 빼며, 폴더(행사·연도)별로 고르게 고릅니다. 빠진 사진은 지워지지 않고 필름스트립에 흐리게 남습니다.
      </p>
      <Field label="사진 1장당 보여 줄 시간">
        <Segmented value={per} onChange={setPer} size="sm" options={[[2, '2초'], [3, '3초 권장'], [4, '4초'], [5, '5초']]} />
      </Field>
      <div className="autosel-plan">
        {plan.count >= plan.total ? `사진 ${plan.total}장을 모두 1장당 ${plan.photoDuration.toFixed(1)}초로 넣을 수 있습니다.` : `${plan.total}장 중 ${plan.count}장을 골라 1장당 약 ${plan.photoDuration.toFixed(1)}초`}
      </div>
      <div className="btn-row">
        <Button icon="sparkle" variant="primary" size="sm" onClick={() => actions.autoSelect(target, per)} disabled={plan.count >= plan.total && !skipped}>
          {skipped ? '다시 선별' : '자동 선별 적용'}
        </Button>
        {skipped > 0 && (
          <Button size="sm" variant="soft" onClick={actions.clearSelection}>
            모든 사진 사용
          </Button>
        )}
      </div>
    </div>
  );
}

function LengthSection({ project, update, tl, actions }) {
  const st = project.style;
  const mode = st.lengthMode === 'total' ? 'total' : 'perPhoto';
  const target = Number(st.targetDuration) || 180;
  const photos = project.items.filter((i) => i.type === 'photo' && !i.skip).length;
  const mm = Math.floor(target / 60);
  const ss = Math.round(target % 60);
  const setTarget = (sec) => update((p) => ({ ...p, style: { ...p.style, lengthMode: 'total', targetDuration: Math.max(10, Math.min(3 * 3600, Math.round(sec))) } }), 'target');
  const ml = musicLength(project.music);
  const pd = tl.photoDuration || st.photoDuration;
  const minLen = mode === 'total' && tl.fitShort ? minimumLength(project) : 0;
  return (
    <Section title="영상 길이">
      <Segmented
        value={mode}
        onChange={(v) => update((p) => setPath(p, 'style.lengthMode', v))}
        options={[['total', '전체 길이 정하기'], ['perPhoto', '사진 1장당 시간 정하기']]}
      />
      {mode === 'total' ? (
        <>
          <div className="time-input">
            <input type="number" min={0} max={180} value={mm} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setTarget((Number(e.target.value) || 0) * 60 + ss)} />
            <span>분</span>
            <input type="number" min={0} max={59} value={ss} onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setTarget(mm * 60 + Math.min(59, Number(e.target.value) || 0))} />
            <span>초</span>
          </div>
          <div className="chip-row">
            {[60, 120, 180, 300, 600, 900].map((s) => (
              <button key={s} className={'chip' + (target === s ? ' on' : '')} onClick={() => setTarget(s)}>
                {s / 60}분
              </button>
            ))}
            {ml > 0 && (
              <button className={'chip' + (Math.abs(target - ml) < 1 ? ' on' : '')} onClick={() => setTarget(ml)}>
                ♪ 음악 길이 ({fmtTime(ml)})
              </button>
            )}
          </div>
          {photos > 0 && (
            <div className={'len-result' + (tl.fitShort || pd < 1.5 ? ' warn' : '')}>
              <b>사진 {photos}장 · 1장당 약 {pd.toFixed(1)}초</b>
              <span>
                {tl.fitShort
                  ? `사진이 많아 가장 빠르게 해도 ${fmtTime(minLen)}입니다. 길이를 늘리거나 사진을 줄여 주세요.`
                  : pd < 1.5
                    ? '사진이 빠르게 지나갑니다. 감상용이라면 길이를 늘리는 것을 권장합니다.'
                    : '사진을 더 넣거나 빼도 전체 길이는 그대로 유지됩니다.'}
              </span>
            </div>
          )}
          {photos > 0 && (pd < 2.6 || project.items.some((i) => i.skip)) && <AutoSelect project={project} actions={actions} target={target} />}
        </>
      ) : (
        <>
          <Slider label="사진 1장당 시간" value={st.photoDuration} min={1} max={12} step={0.1} format={fmtSec} onChange={(v) => update((p) => setPath(p, 'style.photoDuration', v), 'pd')} />
          <p className="hint small">사진 {photos}장 → 전체 {fmtTime(tl.total)} (인트로·엔딩 포함)</p>
          {photos >= 30 && tl.total > 360 && (
            <div className="len-result warn">
              <b>영상이 {Math.round(tl.total / 60)}분으로 깁니다</b>
              <span>
                좋은 사진만 자동으로 골라 원하는 길이로 맞출 수 있습니다 (빠진 사진은 지워지지 않음).
              </span>
              <div className="btn-row">
                <Button icon="sparkle" size="sm" variant="primary" onClick={() => actions.autoSelect(180, 3)}>
                  3분 영상으로 좋은 사진만 고르기
                </Button>
                <Button size="sm" variant="soft" onClick={() => update((p) => ({ ...p, style: { ...p.style, lengthMode: 'total', targetDuration: 180 } }))}>
                  길이 직접 정하기
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- 2. 인트로·문구
/** 인트로 세부 조정: 사진만 보이는 시간 · 글자 속도 · 배경 어둡기 */
function IntroTuning({ project, update, tl, actions }) {
  const intro = project.intro;
  const meta = INTRO_STYLES[intro.style] || {};
  const seg = tl.segments.find((s) => s.type === 'intro');
  const IT = introTiming(intro, seg?.dur || intro.duration);
  const setI = (k, coalesce) => (v) => update((p) => setPath(p, 'intro.' + k, v), coalesce ? 'intro.' + k : null);
  const custom = (Number(intro.photoPhase) || 1) !== 1 || (intro.textSpeed || 'normal') !== 'normal' || intro.dim != null;
  const dimDefault = intro.style === 'cinematic' ? 0.55 : 0.62;
  return (
    <div className="intro-tune">
      <div className="intro-tune-head">
        <b>인트로 세부 조정</b>
        {custom && (
          <button className="link" onClick={() => update((p) => ({ ...p, intro: { ...p.intro, photoPhase: 1, textSpeed: 'normal', dim: null } }))}>
            기본값으로
          </button>
        )}
      </div>
      {meta.photo && (
        <Slider
          label="글자 전에 사진만 보이는 시간"
          value={Number(intro.photoPhase) || 1}
          min={0.4}
          max={3}
          step={0.05}
          format={() => `${IT.s.toFixed(1)}초`}
          onChange={setI('photoPhase', true)}
        />
      )}
      <Field label="글자가 나타나는 속도">
        <Segmented value={intro.textSpeed || 'normal'} onChange={setI('textSpeed')} size="sm" options={[['slow', '천천히'], ['normal', '보통'], ['fast', '빠르게']]} />
      </Field>
      {meta.dimmable && (
        <Slider
          label="글자 뒤 사진 어둡기"
          value={intro.dim == null ? dimDefault : Number(intro.dim)}
          min={0.15}
          max={0.9}
          step={0.01}
          format={(v) => (v < 0.35 ? '밝게 ' : v > 0.72 ? '어둡게 ' : '') + Math.round(v * 100) + '%'}
          onChange={setI('dim', true)}
        />
      )}
      {seg?.extended && (
        <p className="hint small accent">
          글자가 끝까지 읽히도록 실제 인트로는 <b>{seg.dur.toFixed(1)}초</b>로 자동 조정됩니다.
        </p>
      )}
      <p className="hint small">
        {meta.photo ? '사진은 ‘★ 대표 사진’으로 지정한 사진부터 쓰입니다 (사진을 누르고 오른쪽 속성 창에서 지정). ' : ''}
        바꾸면 <button className="link" onClick={actions.previewIntro}>인트로 미리보기</button>로 확인하세요.
      </p>
    </div>
  );
}

export function TextPanel({ project, update, tl, actions }) {
  const t = project.text;
  // 연도를 알 수 있는 사진들의 첫 해 ~ 마지막 해 (연도 카운터 인트로용)
  const photoYears = React.useMemo(() => {
    const ys = project.items.filter((i) => hasKnownYear(i) && !i.skip && i.date).map((i) => new Date(i.date).getFullYear());
    return ys.length >= 2 && Math.min(...ys) < Math.max(...ys) ? [Math.min(...ys), Math.max(...ys)] : null;
  }, [project.items]);
  const set = (k) => (v) => update((p) => setPath(p, 'text.' + k, v), 'text.' + k);
  const peekIntro = () => actions.peek('intro');
  const peekOutro = () => actions.peek('outro');
  return (
    <>
      <Section
        title="영상 종류 (템플릿)"
        right={
          <Button icon="sparkle" size="sm" variant="soft" onClick={actions.openTemplates}>
            템플릿 고르기
          </Button>
        }
        hint="웨딩·생일·여행·추모·행사 등 목적에 맞는 디자인을 한 번에 적용합니다."
      />

      <Section title="인트로" right={<Toggle checked={project.intro.enabled} onChange={(v) => update((p) => setPath(p, 'intro.enabled', v))} label="" />}>
        {project.intro.enabled && (
          <>
            <div className="pcard-grid">
              {Object.entries(INTRO_STYLES).map(([id, s]) => (
                <PreviewCard
                  key={id}
                  project={setPath(project, 'intro.style', id)}
                  kind="intro"
                  on={project.intro.style === id}
                  title={s.name}
                  desc={s.desc}
                  badge={s.isNew ? 'NEW' : null}
                  onClick={() => {
                    update((p) => setPath(p, 'intro.style', id));
                    actions.previewIntro();
                  }}
                />
              ))}
            </div>
            <Slider label="인트로 길이" value={project.intro.duration} min={6} max={18} step={0.5} format={fmtSec} onChange={(v) => update((p) => setPath(p, 'intro.duration', v), 'introdur')} />
            <IntroTuning project={project} update={update} tl={tl} actions={actions} />
            <Button icon="play" variant="soft" size="sm" onClick={actions.previewIntro}>
              인트로 미리보기
            </Button>
          </>
        )}
      </Section>

      <Section title="타이틀 문구" hint="비워 둔 항목은 화면에 나오지 않습니다.">
        <div className="two">
          <Field label="큰 글자 (숫자·이니셜)">
            <TextInput value={t.number} onChange={set('number')} onFocus={peekIntro} placeholder="30" maxLength={8} />
          </Field>
          <Field label="작은 영문">
            <TextInput value={t.eyebrow} onChange={set('eyebrow')} onFocus={peekIntro} placeholder="ANNIVERSARY" maxLength={28} />
          </Field>
        </div>
        <Field label="메인 타이틀">
          <TextInput value={t.title} onChange={set('title')} onFocus={peekIntro} placeholder="함께 걸어온 30년" maxLength={34} />
        </Field>
        <Field label="날짜 / 부제">
          <TextInput value={t.subtitle} onChange={set('subtitle')} onFocus={peekIntro} placeholder="1996 — 2026" maxLength={40} />
        </Field>
        <Field label="기관·회사·이름">
          <TextInput value={t.org} onChange={set('org')} onFocus={peekIntro} placeholder="예) 주식회사 ○○○" maxLength={40} />
        </Field>
        {(project.intro.style === 'light' || project.intro.style === 'timeroll') && (
          <>
            <div className="two">
              <Field label="연도 카운터 시작">
                <TextInput value={String(t.startYear)} onChange={(v) => set('startYear')(v.replace(/[^0-9]/g, ''))} onFocus={peekIntro} maxLength={4} />
              </Field>
              <Field label="연도 카운터 끝">
                <TextInput value={String(t.endYear)} onChange={(v) => set('endYear')(v.replace(/[^0-9]/g, ''))} onFocus={peekIntro} maxLength={4} />
              </Field>
            </div>
            {photoYears && (String(t.startYear) !== String(photoYears[0]) || String(t.endYear) !== String(photoYears[1])) && (
              <button className="link" onClick={() => update((p) => ({ ...p, text: { ...p.text, startYear: photoYears[0], endYear: photoYears[1] } }))}>
                사진 연도로 채우기 ({photoYears[0]} → {photoYears[1]})
              </button>
            )}
          </>
        )}
        <Field label="로고 (선택)" hint="투명 배경 PNG를 권장합니다. 인트로·엔딩·워터마크에 쓰입니다.">
          <div className="btn-row">
            <Button icon="image" variant="soft" size="sm" onClick={actions.pickLogo}>
              {t.logo ? '로고 변경' : '로고 이미지 선택'}
            </Button>
            {t.logo && (
              <>
                <span className="file-chip">{baseName(t.logo)}</span>
                <Button icon="x" size="sm" onClick={() => update((p) => setPath(p, 'text.logo', ''))} title="로고 제거" />
              </>
            )}
          </div>
        </Field>
      </Section>

      <Section title="엔딩" right={<Toggle checked={project.outro.enabled} onChange={(v) => update((p) => setPath(p, 'outro.enabled', v))} label="" />}>
        {project.outro.enabled && (
          <>
            <div className="pcard-grid three">
              {Object.entries(OUTRO_STYLES).map(([id, s]) => (
                <PreviewCard
                  key={id}
                  project={setPath(project, 'outro.style', id)}
                  kind="outro"
                  on={project.outro.style === id}
                  title={s.name}
                  onClick={() => {
                    update((p) => setPath(p, 'outro.style', id));
                    actions.previewOutro();
                  }}
                />
              ))}
            </div>
            <Field label="엔딩 타이틀">
              <TextInput value={t.closingTitle} onChange={set('closingTitle')} onFocus={peekOutro} placeholder="감사합니다" maxLength={24} />
            </Field>
            {project.outro.style !== 'credits' && (
              <Field label="감사 메시지" hint="Enter로 줄을 나눌 수 있습니다 (2~3줄 권장)">
                <TextInput multiline rows={3} value={t.closingMessage} onChange={set('closingMessage')} onFocus={peekOutro} maxLength={160} />
              </Field>
            )}
            {project.outro.style === 'credits' && (
              <Field label="크레딧 (이름 목록)" hint="‘# 제목’은 섹션 제목, ‘역할 : 이름’은 2단으로 표시, 빈 줄은 간격">
                <TextInput multiline rows={7} value={t.credits} onChange={set('credits')} onFocus={() => actions.peek('credits')} placeholder={'# 함께한 사람들\n기획 : 홍길동\n촬영 : 김철수\n\n모든 임직원 여러분'} maxLength={3000} />
              </Field>
            )}
            <Field label="마무리 한 줄">
              <TextInput value={t.closingSub} onChange={set('closingSub')} onFocus={peekOutro} placeholder="앞으로도 함께하겠습니다" maxLength={40} />
            </Field>
            <Slider label="엔딩 길이" value={project.outro.duration} min={6} max={40} step={0.5} format={fmtSec} onChange={(v) => update((p) => setPath(p, 'outro.duration', v), 'outrodur')} />
            <Button icon="play" variant="soft" size="sm" onClick={actions.previewOutro}>
              엔딩 미리보기
            </Button>
          </>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- 3. 스타일
export function StylePanel({ project, update, actions }) {
  const st = project.style;
  const set = (k, coalesce) => (v) => update((p) => setPath(p, 'style.' + k, v), coalesce ? 'style.' + k : null);
  return (
    <>
      <Section title="컬러 테마">
        <div className="theme-grid">
          {Object.entries(THEMES).map(([id, th]) => (
            <button key={id} className={'theme-card' + (st.theme === id ? ' on' : '')} onClick={() => set('theme')(id)}>
              <span className="theme-sw" style={{ background: `radial-gradient(circle at 50% 40%, ${th.bg[1]}, ${th.bg[0]})` }}>
                <i style={{ background: `linear-gradient(180deg, ${th.accent.join(',')})` }} />
              </span>
              <b>{th.name}</b>
              <small>{th.desc}</small>
            </button>
          ))}
        </div>
      </Section>

      <Section title="글꼴">
        <div className="typo-list">
          {Object.entries(TYPOGRAPHY).map(([id, ty]) => (
            <button key={id} className={'typo-card' + (st.typography === id ? ' on' : '')} onClick={() => set('typography')(id)}>
              <span className="typo-num" style={{ fontFamily: `"${ty.display.family}"`, fontWeight: ty.display.weight }}>
                30
              </span>
              <span className="typo-body">
                <span style={{ fontFamily: `"${ty.title.family}"`, fontWeight: ty.title.weight }}>함께 걸어온 시간</span>
                <small>
                  {ty.name} · {ty.desc}
                </small>
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="전환 효과"
        right={
          <Button icon="shuffle" size="sm" onClick={() => set('seed')((st.seed || 1) + 1)} title="같은 스타일 안에서 전환·카메라 움직임 조합을 새로 섞습니다">
            다시 섞기
          </Button>
        }
      >
        <div className="style-cards compact">
          {Object.entries(TRANSITION_STYLES).map(([id, s]) => (
            <button key={id} className={'style-card' + (st.transitionStyle === id ? ' on' : '')} onClick={() => set('transitionStyle')(id)}>
              <span>
                <b>{s.name}</b>
                <small>{s.desc}</small>
              </span>
            </button>
          ))}
        </div>
        <Slider label="전환 시간" value={st.transitionDuration} min={0.5} max={2.5} step={0.1} format={fmtSec} onChange={set('transitionDuration', true)} />
        <Button icon="shuffle" variant="soft" size="sm" onClick={actions.resetTransitions}>
          개별 지정한 전환 모두 ‘자동’으로
        </Button>
        <p className="hint small">개별 전환은 아래 필름스트립의 ◆ 를 눌러 고르면 바로 미리보기로 재생됩니다.</p>
      </Section>

      <Section title="몽타주 장면" hint="사진 사이사이에 폴라로이드·모자이크·분할 화면·필름 스트립 장면을 자동으로 섞어 지루하지 않게 합니다. 자막이나 개별 설정이 있는 사진은 항상 한 장씩 크게 나옵니다.">
        <Segmented
          value={st.montage || 'normal'}
          onChange={set('montage')}
          options={Object.entries(MONTAGE_FREQ).map(([id, f]) => [id, f.name])}
          size="sm"
        />
        <p className="hint small">
          {MONTAGE_FREQ[st.montage || 'normal']?.gap ? `사진 ${MONTAGE_FREQ[st.montage || 'normal'].gap.join('~')}장마다 한 번씩 나옵니다.` : '모든 사진이 한 장씩 나옵니다.'}
        </p>
      </Section>

      <Section title="폴더 이름 표시" hint="사진이 들어 있던 폴더 이름(예: 2019 체육대회)을 화면 왼쪽 위에 작게 보여 줍니다. 폴더 이름 앞의 정렬용 번호(01_ 등)는 자동으로 뺍니다.">
        <Segmented value={st.folderLabel || 'off'} onChange={set('folderLabel')} options={[['off', '표시 안 함'], ['change', '폴더가 바뀔 때만'], ['all', '모든 사진']]} size="sm" />
      </Section>

      <Section title="카메라 움직임" hint="사진이 천천히 확대·이동하는 켄 번스 효과 (사진별 지정은 오른쪽 속성 창)">
        <Segmented value={st.motion} onChange={set('motion')} options={[['none', '없음'], ['subtle', '은은하게'], ['normal', '보통'], ['strong', '역동적']]} />
      </Section>

      <Section title="자막 · 워터마크">
        <Field label="자막 위치">
          <Segmented value={st.captionPos || 'left'} onChange={set('captionPos')} options={[['left', '왼쪽 아래'], ['center', '가운데 아래']]} />
        </Field>
        <Toggle checked={!!st.watermark} onChange={set('watermark')} label="로고·이름 워터마크" desc="사진 장면 구석에 로고(없으면 기관명) 상시 표시" />
        {st.watermark && (
          <Segmented value={st.watermarkPos || 'tr'} onChange={set('watermarkPos')} size="sm" options={[['tl', '↖ 왼쪽 위'], ['tr', '오른쪽 위 ↗'], ['bl', '↙ 왼쪽 아래'], ['br', '오른쪽 아래 ↘']]} />
        )}
      </Section>

      <Section title="사진 색감">
        <div className="chip-row">
          {Object.entries(LOOKS).map(([id, l]) => (
            <button key={id} className={'chip' + (st.look === id ? ' on' : '')} onClick={() => set('look')(id)}>
              {l.name}
            </button>
          ))}
        </div>
        <Slider label="비네팅 (가장자리 어둡게)" value={st.vignette} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={set('vignette', true)} />
        <Slider label="필름 그레인" value={st.grain} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={set('grain', true)} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- 4. 음악
/** 무료 음악 라이브러리: 분위기별 CC0 곡 미리듣기 · 한 번 클릭으로 추가 */
let libAudio = null;
function MusicLibrary({ project, actions, toast }) {
  const [lib, setLib] = useState(null);
  const [mood, setMood] = useState('all');
  const [playing, setPlaying] = useState(null);
  const [busy, setBusy] = useState({});
  const [fetching, setFetching] = useState(false);
  const alive = useRef(true);
  const load = () => api.musicLibrary().then((r) => alive.current && setLib(r));
  useEffect(() => {
    alive.current = true;
    if (isDesktop) load();
    return () => {
      alive.current = false;
      libAudio?.pause();
      libAudio = null;
    };
  }, []);
  if (!isDesktop) return <p className="hint small">무료 음악 라이브러리는 PC 프로그램에서 사용할 수 있습니다.</p>;
  if (!lib) return <div className="empty-note">음악 목록을 불러오는 중…</div>;

  const used = new Set(project.music.tracks.map((t) => t.libId).filter(Boolean));
  const localCount = lib.tracks.filter((t) => t.local).length;
  const list = lib.tracks.filter((t) => mood === 'all' || t.mood === mood);
  const moodName = Object.fromEntries(lib.moods.map((m) => [m.id, m.name]));

  const ensureLocal = async (t) => {
    if (t.local) return t;
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      const r = await api.musicDownload(t.id);
      await load();
      return r;
    } catch {
      toast(`‘${t.title}’을(를) 받지 못했습니다. 인터넷 연결을 확인해 주세요.`, 'error');
      return null;
    } finally {
      alive.current && setBusy((b) => ({ ...b, [t.id]: false }));
    }
  };
  const preview = async (t) => {
    if (playing === t.id) {
      libAudio?.pause();
      return setPlaying(null);
    }
    const lt = await ensureLocal(t);
    if (!lt || !alive.current) return;
    libAudio?.pause();
    libAudio = new Audio(mediaUrl(lt.path));
    libAudio.volume = 0.8;
    libAudio.onended = () => alive.current && setPlaying(null);
    libAudio.play().catch(() => {});
    setPlaying(t.id);
  };
  const add = async (t) => {
    const lt = await ensureLocal(t);
    if (!lt) return;
    libAudio?.pause();
    setPlaying(null);
    actions.addLibraryTrack(lt);
  };
  const fetchOnline = async () => {
    setFetching(true);
    const r = await api.musicFetchOnline();
    if (!alive.current) return;
    setFetching(false);
    if (!r.ok) return toast('무료 음악 목록을 받지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error');
    await load();
    toast('무료 음악 목록을 받았습니다. 곡을 누르면 내려받아 바로 들어 볼 수 있습니다.');
  };

  return (
    <div className="lib">
      <div className="chip-row tight">
        <button className={'chip' + (mood === 'all' ? ' on' : '')} onClick={() => setMood('all')}>
          전체 {lib.tracks.length}
        </button>
        {lib.moods.map((m) => {
          const n = lib.tracks.filter((t) => t.mood === m.id).length;
          return n ? (
            <button key={m.id} className={'chip' + (mood === m.id ? ' on' : '')} onClick={() => setMood(m.id)}>
              {m.name} {n}
            </button>
          ) : null;
        })}
      </div>
      {!lib.tracks.length && (
        <div className="empty-note">
          설치 파일에 들어 있는 음악이 없습니다.
          <br />
          인터넷에 연결되어 있으면 무료 음악을 받을 수 있습니다.
        </div>
      )}
      <div className="lib-list">
        {list.map((t) => (
          <div key={t.id} className={'lib-row' + (playing === t.id ? ' playing' : '')}>
            <button className="lib-play" onClick={() => preview(t)} title={playing === t.id ? '정지' : '미리 듣기'} disabled={busy[t.id]}>
              {busy[t.id] ? <span className="spin" /> : <Icon name={playing === t.id ? 'pause' : 'play'} size={13} />}
            </button>
            <div className="track-name">
              <b title={t.title}>{t.title}</b>
              <small>
                {moodName[t.mood]}
                {t.duration ? ' · ' + fmtTime(t.duration) : ''}
                {!t.local ? ' · 받기 필요' : ''}
              </small>
            </div>
            {used.has(t.id) ? (
              <span className="lib-used">
                <Icon name="check" size={13} /> 사용 중
              </span>
            ) : (
              <Button icon="plus" size="sm" variant="soft" onClick={() => add(t)} disabled={busy[t.id]}>
                넣기
              </Button>
            )}
          </div>
        ))}
      </div>
      {localCount < 30 && localCount === lib.tracks.length && (
        <Button icon="music" size="sm" variant="soft" onClick={fetchOnline} disabled={fetching}>
          {fetching ? '목록 받는 중…' : localCount ? '인터넷에서 무료 음악 더 받기' : '인터넷에서 무료 음악 목록 받기'}
        </Button>
      )}
      <p className="hint small">
        모든 곡은 <b>CC0(퍼블릭 도메인)</b> 음원(FreePD.com)이라 행사 상영·유튜브·SNS에 출처 표기 없이 쓸 수 있습니다. 영상보다 짧으면 자동으로 반복됩니다.
      </p>
    </div>
  );
}

export function MusicPanel({ project, update, tl, actions, toast }) {
  const m = project.music;
  const ml = musicLength(m);
  const set = (k, c) => (v) => update((p) => setPath(p, 'music.' + k, v), c ? 'music.' + k : null);
  const moveTrack = (i, d) =>
    update((p) => {
      const tr = p.music.tracks.slice();
      const j = i + d;
      if (j < 0 || j >= tr.length) return p;
      [tr[i], tr[j]] = [tr[j], tr[i]];
      return setPath(p, 'music.tracks', tr);
    });
  const fit = () => {
    const pd = fitPhotoDurationToLength(project, ml);
    if (pd == null) return toast('사진이 없어 맞출 수 없습니다', 'warn');
    update((p) => ({ ...p, style: { ...p.style, lengthMode: 'total', targetDuration: Math.round(ml * 10) / 10 } }));
    if (pd <= 0.6) toast(`사진이 많아 음악보다 길어집니다. 곡을 추가하거나 사진을 줄여 주세요.`, 'warn');
    else toast(`전체 길이를 음악(${fmtTime(ml)})에 맞췄습니다 · 사진 1장당 약 ${pd.toFixed(1)}초`);
  };
  const ratio = tl.total > 0 ? Math.min(1, ml / Math.max(ml, tl.total)) : 0;
  const vratio = tl.total > 0 ? Math.min(1, tl.total / Math.max(ml, tl.total)) : 0;
  return (
    <>
      <Section title="무료 음악 고르기" hint="▶로 들어 보고 ‘넣기’를 누르면 바로 영상에 들어갑니다.">
        <MusicLibrary project={project} actions={actions} toast={toast} />
      </Section>

      <Section title="배경음악" hint="여러 곡을 넣으면 순서대로 자연스럽게 이어집니다 (크로스페이드). 내 음악 파일(MP3·M4A·WAV)도 넣을 수 있습니다.">
        <Button icon="plus" variant="soft" onClick={actions.addMusic}>
          내 음악 파일 추가
        </Button>
        <div className="track-list">
          {m.tracks.map((t, i) => (
            <div key={t.path + i} className="track">
              <Icon name="music" size={16} />
              <div className="track-name">
                <b>{t.name || baseName(t.path)}</b>
                <small>{t.duration ? fmtTime(t.duration) : '분석 중…'}</small>
              </div>
              <button className="icon-btn" onClick={() => moveTrack(i, -1)} disabled={i === 0} title="위로">
                ▲
              </button>
              <button className="icon-btn" onClick={() => moveTrack(i, 1)} disabled={i === m.tracks.length - 1} title="아래로">
                ▼
              </button>
              <button className="icon-btn" onClick={() => update((p) => setPath(p, 'music.tracks', p.music.tracks.filter((_, j) => j !== i)))} title="삭제">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          {!m.tracks.length && <div className="empty-note">음악이 없으면 무음 영상으로 만들어집니다.</div>}
        </div>
      </Section>

      {m.tracks.length > 0 && (
        <Section title="길이 맞추기">
          <div className="len-compare">
            <div>
              <span>영상</span>
              <div className="bar">
                <i style={{ width: `${vratio * 100}%` }} />
              </div>
              <b>{fmtTime(tl.total)}</b>
            </div>
            <div>
              <span>음악</span>
              <div className="bar music">
                <i style={{ width: `${ratio * 100}%` }} />
              </div>
              <b>{fmtTime(ml)}</b>
            </div>
          </div>
          <Button icon="sparkle" variant="primary" onClick={fit}>
            음악 길이에 영상 맞추기
          </Button>
          <p className="hint small">전체 길이를 음악 길이로 고정합니다. 이후 사진을 더 넣어도 음악이 끝날 때 영상도 함께 끝납니다.</p>
          <Toggle checked={m.loop} onChange={set('loop')} label="음악 반복" desc="음악이 영상보다 짧으면 처음부터 다시 재생" />
        </Section>
      )}

      <Section title="소리">
        <Slider label="음량" value={m.volume} min={0} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={set('volume', true)} />
        <Slider label="시작 페이드인" value={m.fadeIn} min={0} max={6} step={0.5} format={fmtSec} onChange={set('fadeIn', true)} />
        <Slider label="끝 페이드아웃" value={m.fadeOut} min={0} max={12} step={0.5} format={fmtSec} onChange={set('fadeOut', true)} />
        <Slider label="곡 사이 크로스페이드" value={m.crossfade} min={0} max={8} step={0.5} format={fmtSec} onChange={set('crossfade', true)} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- 5. 내보내기
export function ExportPanel({ project, update, tl, actions, onSelectIds }) {
  const o = project.output;
  const set = (k) => (v) => update((p) => setPath(p, 'output.' + k, v));
  const checks = checklist(project, tl);
  const hasError = checks.some((c) => c.level === 'error');
  const size = estimateSizeMB(project, tl.total);
  const out = outputSize(project);
  const frames = Math.ceil(tl.total * (Number(o.fps) || 30));
  const eta = estimateExportSeconds(out.w, out.h, frames);
  const draftSize = frameSize(o.aspect, 720);
  const draftEta = estimateExportSeconds(draftSize.w, draftSize.h, Math.ceil(tl.total * 30));
  return (
    <>
      <Section title="점검">
        <div className="checks">
          {checks.map((c, i) => (
            <div key={i} className={'check ' + c.level} onClick={() => c.ids && onSelectIds(c.ids)} style={{ cursor: c.ids ? 'pointer' : 'default' }}>
              <Icon name={c.level === 'ok' ? 'check' : c.level === 'info' ? 'info' : 'warn'} size={16} />
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="화면 비율" hint="어디에서 보여줄 영상인지 고르세요. 미리보기도 바로 바뀝니다.">
        <div className="aspect-grid">
          {Object.entries(ASPECTS).map(([id, a]) => (
            <button key={id} className={'aspect' + (o.aspect === id ? ' on' : '')} onClick={() => set('aspect')(id)}>
              <span className="aspect-box">
                <i style={{ aspectRatio: `${a.r[0]} / ${a.r[1]}`, [a.r[0] >= a.r[1] ? 'width' : 'height']: '100%' }} />
              </span>
              <b>{a.name}</b>
              <small>{a.desc}</small>
            </button>
          ))}
        </div>
      </Section>

      <Section title="화질">
        <div className="res-list">
          {Object.entries(RESOLUTIONS).map(([id, r]) => {
            const fs = frameSize(o.aspect, r.s);
            return (
              <button key={id} className={'res' + (o.resolution === id ? ' on' : '')} onClick={() => set('resolution')(id)}>
                <b>{r.label}</b>
                <small>
                  {fs.w}×{fs.h}
                </small>
              </button>
            );
          })}
        </div>
        <Field label="초당 프레임">
          <Segmented value={o.fps} onChange={set('fps')} options={[[30, '30fps (권장)'], [60, '60fps (더 부드럽게)']]} />
        </Field>
        <Field label="압축 품질">
          <Segmented value={o.quality} onChange={set('quality')} options={Object.entries(QUALITY).filter(([k]) => k !== 'draft').map(([k, q]) => [k, q.name])} />
        </Field>
        <Field label="인코딩 방식" hint="자동: 그래픽카드(NVIDIA·Intel·AMD) 가속이 되면 사용해 훨씬 빠르게, 안 되면 CPU로 자동 전환">
          <Segmented value={o.encoder === 'cpu' ? 'cpu' : 'auto'} onChange={set('encoder')} options={[['auto', '자동 (권장)'], ['cpu', 'CPU만 사용']]} />
        </Field>
        <p className="hint small">행사장 프로젝터·LED는 대부분 Full HD입니다. 4K는 4K 스크린일 때만 권장합니다 (제작 시간 약 4배).</p>
      </Section>

      <Section title="저장">
        <div className="est">
          <div>
            <span>영상 길이</span>
            <b>{fmtTime(tl.total)}</b>
          </div>
          <div>
            <span>크기</span>
            <b>
              {out.w}×{out.h}
            </b>
          </div>
          <div>
            <span>예상 용량</span>
            <b>약 {size >= 1000 ? (size / 1024).toFixed(1) + 'GB' : Math.max(1, Math.round(size)) + 'MB'}</b>
          </div>
        </div>
        <p className="hint small">
          {eta ? `예상 제작 시간: 약 ${fmtTime(eta)} (이 PC에서 측정한 속도 기준)` : '예상 제작 시간은 첫 제작 때 이 PC의 속도를 측정해 다음부터 알려드립니다.'}
        </p>
        {o.path && <p className="hint small">지난번 저장 위치: {o.path}</p>}
        <Button icon="export" variant="primary" size="lg" disabled={hasError || !isDesktop} onClick={() => actions.startExport(false)}>
          영상 파일 만들기 (MP4)
        </Button>
        <Button icon="play" variant="soft" disabled={hasError || !isDesktop} onClick={() => actions.startExport(true)}>
          빠른 시안 먼저 만들기 (720p{draftEta ? ` · 약 ${fmtTime(draftEta)}` : ''})
        </Button>
        <p className="hint small">시안: 화질을 낮춰 빠르게 만들어 전체 흐름·오타·음악을 실제 영상으로 확인할 때 사용하세요.</p>
        <p className="hint small">{isDesktop ? '버튼을 누르면 저장할 위치와 파일 이름을 고를 수 있습니다.' : '영상 파일 만들기는 PC 설치 버전에서 사용할 수 있습니다.'}</p>
      </Section>
    </>
  );
}
