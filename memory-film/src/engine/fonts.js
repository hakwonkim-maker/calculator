// 폰트 로딩 보장: 캔버스는 웹폰트가 로드되기 전이면 대체 글꼴로 그려버리므로
// 렌더 전에 프로젝트에 쓰인 모든 글자에 대해 필요한 서브셋을 미리 로드한다.
import { TYPOGRAPHY, fontStr } from './presets.js';
import { photoText } from './timeline.js';

const loaded = new Set();

export async function ensureFonts(project) {
  const typo = TYPOGRAPHY[project.style.typography] || TYPOGRAPHY.classic;
  const tx = project.text;
  const texts = [
    tx.number, tx.eyebrow, tx.title, tx.subtitle, tx.org, tx.closingTitle, tx.closingMessage, tx.closingSub, tx.credits,
    String(tx.startYear), String(tx.endYear), '0123456789 —·',
    '사진을 불러올 수 없습니다',
    ...project.items.flatMap((i) => [i.caption, i.label, i.title, i.subtitle]),
    // 폴더 이름·날짜 (폴더 태그·매거진·시네마·연표·스크랩북 손글씨에 쓰임)
    ...project.items.filter((i) => i.type === 'photo').flatMap((i) => {
      const t = photoText(i, project.style);
      return [t.folder, t.date, t.folder.toUpperCase()];
    }),
  ]
    .filter(Boolean)
    .join(' ');
  const uniq = Array.from(new Set(Array.from(texts))).join('');
  // 스크랩북 몽타주의 손글씨는 글꼴 설정과 관계없이 나눔펜
  const specs = [typo.display, typo.eyebrow, typo.title, typo.body, { family: 'Nanum Pen Script', weight: 400 }];
  const weights = new Set();
  const jobs = [];
  for (const spec of specs) {
    for (const w of [spec.weight, Math.max(500, spec.weight), Math.min(600, spec.weight + (spec.weight < 400 ? 200 : 0))]) {
      const key = `${spec.family}|${w}|${uniq}`;
      if (loaded.has(key) || weights.has(spec.family + w)) continue;
      weights.add(spec.family + w);
      jobs.push(
        document.fonts
          .load(fontStr(spec, 40, w), uniq)
          .then(() => loaded.add(key))
          .catch(() => {}),
      );
    }
  }
  await Promise.all(jobs);
  await document.fonts.ready;
}
