// 도움말: 빠른 사용법 · 문제 해결(로그) · 오픈소스 고지 · 음악 출처 · 버전
import React, { useEffect, useState } from 'react';
import { Button, Icon, Segmented } from './controls.jsx';
import { api, isDesktop } from '../platform.js';

export function HelpModal({ onClose }) {
  const [tab, setTab] = useState('guide');
  const [info, setInfo] = useState(null);
  const [notices, setNotices] = useState('');
  const [lib, setLib] = useState(null);
  useEffect(() => {
    if (!isDesktop) return;
    api.info?.().then(setInfo);
    api.notices?.().then(setNotices);
    api.musicLibrary?.().then(setLib);
  }, []);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal help-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="tpl-head">
          <div className="modal-title">
            <Icon name="info" size={20} /> 도움말 {info?.version && <small className="help-ver">MEMORIA v{info.version}</small>}
          </div>
          <Button icon="x" onClick={onClose} title="닫기" />
        </div>
        <Segmented value={tab} onChange={setTab} size="sm" options={[['guide', '빠른 사용법'], ['trouble', '문제 해결'], ['music', '음악 출처'], ['license', '오픈소스 고지']]} />
        <div className="help-body">
          {tab === 'guide' && (
            <ol className="help-steps">
              <li><b>가장 빠르게:</b> 상단 <b>✨ 매직</b> → 인트로·음악 고르기 → 사진 폴더 선택 → 끝. 사진 정렬·좋은 사진 고르기·연도 챕터·박자 맞춤·옛 사진 보정이 자동입니다.</li>
              <li><b>직접 만들기:</b> 왼쪽 단계 순서대로 <b>사진 → 문구 → 스타일 → 음악 → 내보내기</b>. 각 단계 맨 아래 ‘다음’ 버튼을 따라가면 됩니다.</li>
              <li><b>사진 하나 고치기:</b> 아래 필름스트립에서 사진을 누르면 오른쪽에서 자막·중심점·회전·보정·몽타주를 바꿀 수 있습니다.</li>
              <li><b>몽타주 바꾸기:</b> 몽타주에 들어간 사진을 누르고 ‘이 몽타주 편집하기’ → 효과 바꾸기·풀기·삭제.</li>
              <li><b>저장:</b> Ctrl+S로 .memoria 파일 저장. 저장하지 않아도 다음 실행 때 마지막 작업이 복원됩니다.</li>
              <li><b>영상 파일:</b> 내보내기 → ‘빠른 시안’으로 먼저 확인한 뒤 ‘영상 파일 만들기’.</li>
              <li><b>단축키:</b> Space 재생/정지 · ←/→ 장면 이동 · Ctrl+Z 되돌리기 · Ctrl+N 새로 만들기 · Delete 삭제</li>
            </ol>
          )}
          {tab === 'trouble' && (
            <div className="help-trouble">
              <p><b>사진이 ‘파일 없음’으로 나와요</b> — 사진 폴더를 옮긴 경우입니다. 알림의 ‘사진 폴더 다시 찾기’로 새 위치를 고르면 같은 이름의 사진을 다시 연결합니다.</p>
              <p><b>순서가 이상해요</b> — 스캔·메신저로 받은 사진은 촬영일 정보가 없습니다. 폴더 이름에 연도(예: 1999_창립식)를 넣고 ‘촬영일순’을 누르세요.</p>
              <p><b>영상 만들기가 실패해요</b> — 저장 위치의 여유 공간, 같은 이름의 영상 파일이 다른 프로그램(플레이어)에서 열려 있지 않은지 확인하세요. 인코딩 방식을 ‘CPU만 사용’으로 바꾸면 대부분 해결됩니다.</p>
              <p><b>느려요</b> — 미리보기 화질 ‘가볍게’, 내보내기 전 ‘빠른 시안’, 4K 대신 Full HD를 권장합니다.</p>
              <p><b>문제를 알려 주실 때</b> — 아래 버튼으로 열리는 폴더의 <code>memoria.log</code> 파일을 함께 보내 주시면 원인을 빨리 찾을 수 있습니다.</p>
              {isDesktop && (
                <Button icon="folder" variant="soft" size="sm" onClick={() => api.openLogs()}>
                  문제 보고서(로그) 폴더 열기
                </Button>
              )}
            </div>
          )}
          {tab === 'music' && (
            <div className="help-music">
              <p className="hint small">퍼블릭 도메인 곡은 출처 표기 없이, CC BY 곡은 영상 끝에 출처가 자동으로 표기된 상태로 상업적 사용이 가능합니다.</p>
              {!lib?.tracks?.length && <p className="hint small">설치된 무료 음악이 없습니다.</p>}
              <table>
                <tbody>
                  {(lib?.tracks || []).filter((t) => t.local).map((t) => (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>{t.needsCredit ? t.credit : `${t.license || '퍼블릭 도메인'}${t.credit && t.credit !== '퍼블릭 도메인' ? ' · ' + t.credit : ''}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'license' && <pre className="help-notices">{notices || 'THIRD_PARTY_NOTICES.txt 를 찾을 수 없습니다.'}</pre>}
        </div>
      </div>
    </div>
  );
}
