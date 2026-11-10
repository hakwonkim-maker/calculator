import React from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import App from './ui/App.jsx';
import { api } from './platform.js';

// 예기치 않은 오류는 로그 파일에 남김 (고객 지원용)
const report = (...a) => {
  try {
    api?.log?.(...a.map((x) => (x instanceof Error ? x.stack || x.message : String(x))));
  } catch {}
};
window.addEventListener('error', (e) => report('error', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => report('unhandledrejection', e.reason));

/** 화면 오류가 나도 하얀 화면 대신 안내 + 복구 (작업은 자동 저장에서 복원) */
class Guard extends React.Component {
  constructor(p) {
    super(p);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    report('react', error, info?.componentStack || '');
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <div className="empty-mark">◆</div>
          <h2>화면에 문제가 생겼습니다</h2>
          <p>작업 내용은 자동 저장되어 있습니다. ‘다시 열기’를 누르면 마지막 상태로 복원됩니다.</p>
          <pre>{String(this.state.error?.message || this.state.error).slice(0, 300)}</pre>
          <div className="btn-row center">
            <button className="btn btn-primary" onClick={() => location.reload()}>
              다시 열기
            </button>
            {api?.openLogs && (
              <button className="btn btn-soft" onClick={() => api.openLogs()}>
                문제 보고서(로그) 폴더 열기
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <Guard>
    <App />
  </Guard>,
);
