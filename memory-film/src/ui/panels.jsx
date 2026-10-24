// 좌측 단계별 설정 패널
import React, { useState } from 'react';
import { Section, Field, TextInput, Slider, Segmented, Toggle, Button, Icon } from './controls.jsx';
import { THEMES, TYPOGRAPHY, LOOKS, TRANSITION_STYLES, RESOLUTIONS, QUALITY } from '../engine/presets.js';
import { fitPhotoDurationToLength } from '../engine/timeline.js';
import { fmtTime } from '../engine/math.js';
import { setPath } from './store.js';
import { sortPhotos, autoChapters, autoYearLabels, musicLength, checklist, estimateSizeMB, defaultVideoName } from './logic.js';
import { isDesktop, api, baseName } from '../platform.js';

const fmtSec = (v) => `${Number(v).toFixed(1)}초`;

// ---------------------------------------------------------------- 1. 사진
export function PhotosPanel({ project, update, tl, actions, toast }) {
  const [recursive, setRecursive] = useState(true);
  const photos = project.items.filter((i) => i.type === 'photo');
  const exifCount = photos.filter((p) => p.dateSource === 'exif').length;
  const chapters = project.items.filter((i) => i.type === 'chapter').length;
  return (
    <>
      <Section title="사진 불러오기" hint="폴더를 선택하면 안의 사진을 촬영일 순서로 가져옵니다. 사진 파일을 끌어다 놓아도 됩니다.">
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
            <b>{photos.length}</b>
            <span>사진</span>
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

      <Section title="순서 정리" hint="정렬은 챕터 카드 사이 구간별로 적용되어 챕터 구성이 유지됩니다.">
        <div className="btn-row">
          <Button icon="calendar" variant="soft" disabled={!photos.length} onClick={() => update((p) => sortPhotos(p, 'date'), null) || toast('촬영일 순으로 정렬했습니다')}>
            촬영일순
          </Button>
          <Button icon="sort" variant="soft" disabled={!photos.length} onClick={() => update((p) => sortPhotos(p, 'name'), null) || toast('파일 이름 순으로 정렬했습니다')}>
            파일명순
          </Button>
          <Button variant="soft" disabled={!photos.length} onClick={() => update((p) => ({ ...p, items: p.items.slice().reverse() }), null)}>
            역순
          </Button>
        </div>
      </Section>

      <Section title="스토리 자동 구성" hint={exifCount ? `촬영일 정보가 있는 사진 ${exifCount}장을 기준으로 만듭니다.` : '촬영일(EXIF) 정보가 있는 사진에만 적용됩니다. 스캔한 옛 사진은 직접 입력해 주세요.'}>
        <div className="stack">
          <Button
            icon="chapter"
            variant="soft"
            disabled={!exifCount}
            onClick={() => {
              update((p) => autoChapters(p), null);
              toast('연도가 바뀌는 지점에 챕터 카드를 넣었습니다');
            }}
          >
            연도별 챕터 카드 자동 생성
          </Button>
          <Button
            icon="calendar"
            variant="soft"
            disabled={!exifCount}
            onClick={() => {
              let n = 0;
              update((p) => {
                const r = autoYearLabels(p);
                n = r.count;
                return r.project;
              }, null);
              setTimeout(() => toast(`사진 ${n}장에 연도 라벨을 넣었습니다`), 0);
            }}
          >
            사진에 촬영 연도 표시
          </Button>
          <Button icon="plus" variant="soft" onClick={actions.addChapter}>
            챕터 카드 직접 추가
          </Button>
        </div>
      </Section>

      <Section title="사진 표시">
        <Slider label="사진 1장당 시간" value={project.style.photoDuration} min={2} max={12} step={0.1} format={fmtSec} onChange={(v) => update((p) => setPath(p, 'style.photoDuration', v), 'pd')} />
        <Field label="화면 맞춤">
          <Segmented
            value={project.style.fit}
            onChange={(v) => update((p) => setPath(p, 'style.fit', v))}
            options={[['auto', '자동'], ['cover', '꽉 채우기'], ['contain', '전체 보이기']]}
          />
        </Field>
        <p className="hint small">자동: 화면 비율과 비슷한 사진은 꽉 채우고, 세로·정사각 사진은 잘리지 않게 흐린 배경 위에 보여줍니다.</p>
        <Toggle checked={project.style.photoFrame} onChange={(v) => update((p) => setPath(p, 'style.photoFrame', v))} label="인화지 테두리" desc="전체 보이기 사진에 흰 테두리 (옛날 사진 느낌)" />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- 2. 문구
const INTRO_STYLES = {
  golden: { name: '골든 타이틀', desc: '빛 입자 속에서 금빛 숫자가 떠오르는 격식 있는 오프닝', grad: 'linear-gradient(135deg,#0b0906,#3a2c12 60%,#d9b867)' },
  mosaic: { name: '메모리 모자이크', desc: '우리 사진들이 벽처럼 펼쳐진 뒤 타이틀 등장', grad: 'linear-gradient(135deg,#1c2b40,#5a6f8f 50%,#c9b48a)' },
  light: { name: '이어온 시간', desc: '연도 카운터가 창립 연도부터 올해까지 흐른 뒤 타이틀', grad: 'linear-gradient(135deg,#f6efe2,#e6d3ad 60%,#a8823e)' },
};

export function TextPanel({ project, update, actions }) {
  const t = project.text;
  const set = (k) => (v) => update((p) => setPath(p, 'text.' + k, v), 'text.' + k);
  return (
    <>
      <Section title="인트로" right={<Toggle checked={project.intro.enabled} onChange={(v) => update((p) => setPath(p, 'intro.enabled', v))} label="" />}>
        {project.intro.enabled && (
          <>
            <div className="style-cards">
              {Object.entries(INTRO_STYLES).map(([id, s]) => (
                <button key={id} className={'style-card' + (project.intro.style === id ? ' on' : '')} onClick={() => update((p) => setPath(p, 'intro.style', id))}>
                  <span className="style-swatch" style={{ background: s.grad }} />
                  <span>
                    <b>{s.name}</b>
                    <small>{s.desc}</small>
                  </span>
                </button>
              ))}
            </div>
            <Slider label="인트로 길이" value={project.intro.duration} min={6} max={18} step={0.5} format={fmtSec} onChange={(v) => update((p) => setPath(p, 'intro.duration', v), 'introdur')} />
            <Button icon="play" variant="soft" size="sm" onClick={actions.previewIntro}>
              인트로 미리보기
            </Button>
          </>
        )}
      </Section>

      <Section title="타이틀 문구" hint="인트로 화면에 위에서부터 이 순서로 표시됩니다.">
        <div className="two">
          <Field label="큰 숫자">
            <TextInput value={t.number} onChange={set('number')} placeholder="30" maxLength={6} />
          </Field>
          <Field label="숫자 아래 영문">
            <TextInput value={t.eyebrow} onChange={set('eyebrow')} placeholder="ANNIVERSARY" maxLength={24} />
          </Field>
        </div>
        <Field label="메인 타이틀">
          <TextInput value={t.title} onChange={set('title')} placeholder="함께 걸어온 30년" maxLength={30} />
        </Field>
        <Field label="연도 / 부제">
          <TextInput value={t.subtitle} onChange={set('subtitle')} placeholder="1996 — 2026" maxLength={40} />
        </Field>
        <Field label="기관·회사명">
          <TextInput value={t.org} onChange={set('org')} placeholder="예) 주식회사 ○○○" maxLength={40} />
        </Field>
        {project.intro.style === 'light' && (
          <div className="two">
            <Field label="카운터 시작 연도">
              <TextInput value={String(t.startYear)} onChange={(v) => set('startYear')(v.replace(/[^0-9]/g, ''))} maxLength={4} />
            </Field>
            <Field label="카운터 끝 연도">
              <TextInput value={String(t.endYear)} onChange={(v) => set('endYear')(v.replace(/[^0-9]/g, ''))} maxLength={4} />
            </Field>
          </div>
        )}
        <Field label="로고 (선택)" hint="투명 배경 PNG를 권장합니다. 인트로와 엔딩에 표시됩니다.">
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
            <Field label="엔딩 타이틀">
              <TextInput value={t.closingTitle} onChange={set('closingTitle')} placeholder="감사합니다" maxLength={24} />
            </Field>
            <Field label="감사 메시지" hint="Enter로 줄을 나눌 수 있습니다 (2~3줄 권장)">
              <TextInput multiline rows={3} value={t.closingMessage} onChange={set('closingMessage')} maxLength={140} />
            </Field>
            <Field label="마무리 한 줄">
              <TextInput value={t.closingSub} onChange={set('closingSub')} placeholder="앞으로의 30년도 함께하겠습니다" maxLength={40} />
            </Field>
            <Slider label="엔딩 길이" value={project.outro.duration} min={6} max={20} step={0.5} format={fmtSec} onChange={(v) => update((p) => setPath(p, 'outro.duration', v), 'outrodur')} />
          </>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- 3. 스타일
export function StylePanel({ project, update }) {
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

      <Section title="타이포그래피">
        <div className="typo-list">
          {Object.entries(TYPOGRAPHY).map(([id, ty]) => (
            <button key={id} className={'typo-card' + (st.typography === id ? ' on' : '')} onClick={() => set('typography')(id)}>
              <span className="typo-num" style={{ fontFamily: `"${ty.display.family}"`, fontWeight: ty.display.weight }}>30</span>
              <span className="typo-body">
                <span style={{ fontFamily: `"${ty.title.family}"`, fontWeight: ty.title.weight }}>함께 걸어온 30년</span>
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
        <p className="hint small">개별 전환은 아래 필름스트립의 ◆ 버튼으로 바꿀 수 있습니다.</p>
      </Section>

      <Section title="카메라 움직임" hint="사진이 천천히 확대·이동하는 켄 번스 효과">
        <Segmented value={st.motion} onChange={set('motion')} options={[['none', '없음'], ['subtle', '은은하게'], ['normal', '보통'], ['strong', '역동적']]} />
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
    if (pd < 2) return toast(`사진이 많아 1장당 ${pd.toFixed(1)}초가 됩니다. 곡을 추가하거나 사진을 줄여 주세요.`, 'warn');
    if (pd > 12) return toast(`사진이 적어 1장당 ${pd.toFixed(1)}초가 됩니다. 곡 반복을 끄거나 짧은 곡을 사용해 보세요.`, 'warn');
    update((p) => setPath(p, 'style.photoDuration', pd));
    toast(`사진 1장당 ${pd.toFixed(2)}초로 맞췄습니다`);
  };
  const ratio = tl.total > 0 ? Math.min(1, ml / Math.max(ml, tl.total)) : 0;
  const vratio = tl.total > 0 ? Math.min(1, tl.total / Math.max(ml, tl.total)) : 0;
  return (
    <>
      <Section title="배경음악" hint="여러 곡을 넣으면 순서대로 자연스럽게 이어집니다 (크로스페이드).">
        <Button icon="plus" variant="soft" onClick={actions.addMusic}>
          음악 파일 추가
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
          <p className="hint small">사진 1장당 시간을 자동 계산해 음악이 끝나는 순간 영상도 함께 끝나도록 합니다.</p>
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
  const pickPath = async () => {
    const p = await api.saveVideoDialog(o.path ? baseName(o.path) : defaultVideoName(project));
    if (p) set('path')(p);
  };
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

      <Section title="화질">
        <div className="res-list">
          {Object.entries(RESOLUTIONS).map(([id, r]) => (
            <button key={id} className={'res' + (o.resolution === id ? ' on' : '')} onClick={() => set('resolution')(id)}>
              <b>{r.label}</b>
              <small>
                {r.w}×{r.h}
              </small>
            </button>
          ))}
        </div>
        <Field label="초당 프레임">
          <Segmented value={o.fps} onChange={set('fps')} options={[[30, '30fps (권장)'], [60, '60fps (더 부드럽게)']]} />
        </Field>
        <Field label="압축 품질">
          <Segmented value={o.quality} onChange={set('quality')} options={Object.entries(QUALITY).map(([k, q]) => [k, q.name])} />
        </Field>
        <p className="hint small">행사장 프로젝터·LED는 대부분 Full HD입니다. 4K는 4K 스크린일 때만 권장합니다 (제작 시간 약 4배).</p>
      </Section>

      <Section title="저장">
        <Field label="파일 이름 · 위치">
          <div className="path-row">
            <span className="path-box" title={o.path}>
              {o.path || '만들기를 누르면 저장 위치를 묻습니다'}
            </span>
            {isDesktop && (
              <Button size="sm" variant="soft" onClick={pickPath}>
                변경
              </Button>
            )}
          </div>
        </Field>
        <div className="est">
          <div>
            <span>영상 길이</span>
            <b>{fmtTime(tl.total)}</b>
          </div>
          <div>
            <span>예상 용량</span>
            <b>약 {size >= 1000 ? (size / 1024).toFixed(1) + 'GB' : Math.max(1, Math.round(size)) + 'MB'}</b>
          </div>
          <div>
            <span>형식</span>
            <b>MP4 (H.264)</b>
          </div>
        </div>
        <Button icon="export" variant="primary" size="lg" disabled={hasError || !isDesktop} onClick={actions.startExport}>
          영상 만들기
        </Button>
        {!isDesktop && <p className="hint small">영상 파일 만들기는 PC 설치 버전에서 사용할 수 있습니다.</p>}
      </Section>
    </>
  );
}
