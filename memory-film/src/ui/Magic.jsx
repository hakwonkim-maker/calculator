// 매직 버튼: 인트로 → 음악 → 사진만 고르면 나머지 연출은 자동
import React, { useEffect, useRef, useState } from 'react';
import { Button, Icon } from './controls.jsx';
import { PreviewCard } from './panels.jsx';
import { INTRO_STYLES } from '../engine/presets.js';
import { setPath } from './store.js';
import { api, isDesktop, mediaUrl } from '../platform.js';
import { fmtTime } from '../engine/math.js';

// 영상 종류(템플릿) → 어울리는 음악 분위기
const MOOD_FOR = { anniversary: 'epic', wedding: 'warm', birthday: 'bright', graduation: 'epic', travel: 'bright', family: 'warm', memorial: 'calm', event: 'party', yearend: 'party' };

let previewAudio = null;

export function MagicModal({ project, onClose, onRun }) {
  const [intro, setIntro] = useState(project.intro.style);
  const [lib, setLib] = useState(null);
  const [mood, setMood] = useState(MOOD_FOR[project.template] || 'warm');
  const [music, setMusic] = useState(null); // { kind: 'lib', track } | { kind: 'none' } | { kind: 'keep' } | { kind: 'file' }
  const [playing, setPlaying] = useState(null);
  const photos = project.items.filter((i) => i.type === 'photo');
  const used = photos.filter((i) => !i.skip).length;
  const [source, setSource] = useState(photos.length ? 'project' : 'folder');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (isDesktop && api.musicLibrary) api.musicLibrary().then((r) => alive.current && setLib(r));
    return () => {
      alive.current = false;
      previewAudio?.pause();
      previewAudio = null;
    };
  }, []);
  // 기본 음악: 지금 음악이 있으면 유지, 없으면 영상 종류에 맞는 분위기의 첫 곡
  useEffect(() => {
    if (music) return;
    if (project.music.tracks.length) setMusic({ kind: 'keep' });
    else if (lib) {
      const t = lib.tracks.find((x) => x.local && x.mood === mood) || lib.tracks.find((x) => x.local);
      setMusic(t ? { kind: 'lib', track: t } : { kind: 'none' });
    } else if (!isDesktop) setMusic({ kind: 'none' });
  }, [lib]);

  const list = lib ? lib.tracks.filter((t) => t.mood === mood) : [];
  const reqId = useRef(0);
  const preview = async (t) => {
    previewAudio?.pause();
    const my = ++reqId.current;
    if (playing === t.id) return setPlaying(null);
    let p = t.path;
    if (!t.local) {
      try {
        p = (await api.musicDownload(t.id)).path;
      } catch {
        return;
      }
    }
    // 받는 사이 창이 닫혔거나 다른 곡을 눌렀으면 재생하지 않음
    if (!alive.current || my !== reqId.current) return;
    previewAudio = new Audio(mediaUrl(p));
    previewAudio.volume = 0.8;
    previewAudio.play().catch(() => {});
    previewAudio.onended = () => alive.current && setPlaying(null);
    setPlaying(t.id);
  };
  const ready = music && (source === 'project' ? used > 0 : true);

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal magic-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="tpl-head">
          <div>
            <div className="modal-title">
              <Icon name="sparkle" size={20} /> 매직으로 영상 만들기
            </div>
            <p className="hint">인트로와 음악만 고르면, 사진 정렬·좋은 사진 고르기·연도 챕터·몽타주·박자 맞춤·옛 사진 보정·길이까지 알아서 구성합니다.</p>
          </div>
          <Button icon="x" onClick={onClose} title="닫기" />
        </div>

        <div className="magic-body">
          <section>
            <h4>
              <span className="magic-no">1</span> 인트로
            </h4>
            <div className="pcard-grid magic-intros">
              {Object.entries(INTRO_STYLES).map(([id, s]) => (
                <PreviewCard key={id} project={setPath(project, 'intro.style', id)} kind="intro" on={intro === id} title={s.name} badge={s.isNew ? 'NEW' : null} onClick={() => setIntro(id)} />
              ))}
            </div>
          </section>

          <section>
            <h4>
              <span className="magic-no">2</span> 음악
            </h4>
            <div className="chip-row tight">
              {project.music.tracks.length > 0 && (
                <button className={'chip' + (music?.kind === 'keep' ? ' on' : '')} onClick={() => setMusic({ kind: 'keep' })}>
                  지금 음악 그대로 ({project.music.tracks.length}곡)
                </button>
              )}
              <button className={'chip' + (music?.kind === 'none' ? ' on' : '')} onClick={() => setMusic({ kind: 'none' })}>
                음악 없이
              </button>
              {isDesktop && (
                <button className={'chip' + (music?.kind === 'file' ? ' on' : '')} onClick={() => setMusic({ kind: 'file' })}>
                  내 음악 파일…
                </button>
              )}
            </div>
            {lib && lib.tracks.length > 0 && (
              <>
                <div className="chip-row tight">
                  {lib.moods.map((m) => (
                    <button key={m.id} className={'chip' + (mood === m.id ? ' on' : '')} onClick={() => setMood(m.id)}>
                      {m.name}
                    </button>
                  ))}
                </div>
                <div className="lib-list magic-tracks">
                  {list.map((t) => (
                    <div key={t.id} className={'lib-row' + (music?.track?.id === t.id ? ' playing' : '')} onClick={() => setMusic({ kind: 'lib', track: t })}>
                      <button
                        className="lib-play"
                        onClick={(e) => {
                          e.stopPropagation();
                          preview(t);
                        }}
                        title="미리 듣기"
                      >
                        <Icon name={playing === t.id ? 'pause' : 'play'} size={13} />
                      </button>
                      <div className="track-name">
                        <b>{t.title}</b>
                        <small>
                          {t.duration ? fmtTime(t.duration) : ''}
                          {t.needsCredit ? ' · CC BY (엔딩에 출처 자동)' : ' · 퍼블릭 도메인'}
                        </small>
                      </div>
                      {music?.track?.id === t.id && <Icon name="check" size={16} />}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <h4>
              <span className="magic-no">3</span> 사진
            </h4>
            <div className="import-grid">
              <button className={'import-btn' + (source === 'folder' ? ' primary' : '')} onClick={() => setSource('folder')}>
                <Icon name="folder" size={24} />
                <b>새 폴더 선택</b>
                <small>폴더 안 사진 전체로 새로 구성</small>
              </button>
              <button className={'import-btn' + (source === 'project' ? ' primary' : '')} onClick={() => setSource('project')} disabled={!photos.length}>
                <Icon name="film" size={24} />
                <b>지금 프로젝트 사진</b>
                <small>{photos.length ? `${used}장 사용 중 · 고친 내용 유지` : '불러온 사진 없음'}</small>
              </button>
            </div>
            {source === 'project' && photos.length > 0 && (
              <p className="hint small">순서·자막·★대표 사진·뺀 사진·문구는 그대로 두고 전환·몽타주·카메라 움직임·길이 등 연출만 새로 만듭니다.</p>
            )}
            {source === 'folder' && photos.length > 0 && <p className="hint small">지금 사진 대신 새 폴더의 사진으로 바뀝니다 (문구·템플릿은 유지, 되돌리기 가능).</p>}
          </section>
        </div>

        <div className="modal-actions">
          <Button onClick={onClose}>취소</Button>
          <Button icon="sparkle" variant="primary" disabled={!ready} onClick={() => onRun({ intro, music, source })}>
            {source === 'folder' ? '폴더 고르고 영상 만들기' : '매직으로 영상 만들기'}
          </Button>
        </div>
      </div>
    </div>
  );
}
