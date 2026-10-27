// 무료 음악 라이브러리 (30곡)
//  ① 퍼블릭 도메인 클래식 연주 — Wikimedia Commons에서 '퍼블릭 도메인/CC0' 녹음만 골라 받음 (출처 표기 불필요)
//  ② Kevin MacLeod(incompetech.com) 곡 — CC BY 4.0: 사용 시 영상 엔딩에 출처 한 줄을 자동으로 넣음
// 설치 파일 빌드 때(scripts/fetch-music.cjs) 미리 받아 resources/music-library 에 넣고,
// 빠진 곡은 프로그램 안에서 같은 방식으로 받아 사용자 폴더에 저장한다.
// (원래 쓰려던 FreePD.com은 2026년 폐쇄됨)
const fs = require('fs');
const path = require('path');

const UA = 'MEMORIA-Film-Studio/1.4 (https://github.com/hakwonkim-maker/calculator)';
const COMMONS = process.env.MF_COMMONS_API || 'https://commons.wikimedia.org/w/api.php';
const INCOMPETECH = process.env.MF_INCOMPETECH || 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
const SITE = 'Wikimedia Commons · incompetech.com';
const LICENSE = '퍼블릭 도메인 클래식 + CC BY 4.0 (Kevin MacLeod)';

// want: 분위기별 곡 수 (합계 30). 후보는 앞에서부터 받고, 실패하면 다음 후보로 대체
const MOODS = [
  { id: 'warm', name: '따뜻·감동', want: 6 },
  { id: 'calm', name: '잔잔·서정', want: 6 },
  { id: 'bright', name: '밝고 경쾌', want: 6 },
  { id: 'epic', name: '웅장·벅참', want: 5 },
  { id: 'party', name: '신나는', want: 4 },
  { id: 'fun', name: '유쾌·발랄', want: 3 },
];

// c: Commons 검색어(클래식, 퍼블릭 도메인 녹음만) · k: Kevin MacLeod 곡 제목(CC BY 4.0)
const CANDIDATES = {
  warm: [
    { c: 'Pachelbel Canon in D', title: '파헬벨 – 캐논' },
    { c: 'Bach Air on the G String', title: '바흐 – G선상의 아리아' },
    { k: 'Heartwarming' },
    { c: 'Schumann Träumerei', title: '슈만 – 트로이메라이' },
    { c: "Elgar Salut d'amour", title: '엘가 – 사랑의 인사' },
    { k: 'Dreamer' },
    { c: 'Schubert Ave Maria', title: '슈베르트 – 아베 마리아' },
    { c: 'Massenet Méditation Thaïs', title: '마스네 – 타이스의 명상곡' },
    { k: 'Touching Moments Two - Higher' },
  ],
  calm: [
    { c: 'Debussy Clair de lune', title: '드뷔시 – 달빛' },
    { c: 'Satie Gymnopédie No. 1', title: '사티 – 짐노페디 1번' },
    { c: 'Chopin Nocturne Op. 9 No. 2', title: '쇼팽 – 녹턴 Op.9-2' },
    { c: 'Beethoven Moonlight Sonata first movement', title: '베토벤 – 월광 소나타 1악장' },
    { c: 'Bach Prelude in C major BWV 846', title: '바흐 – 평균율 전주곡 C장조' },
    { k: 'Comfortable Mystery' },
    { c: 'Beethoven Für Elise', title: '베토벤 – 엘리제를 위하여' },
    { c: 'Liszt Liebestraum No. 3', title: '리스트 – 사랑의 꿈 3번' },
  ],
  bright: [
    { k: 'Carefree' },
    { c: 'Vivaldi Spring Four Seasons Allegro', title: '비발디 – 사계 중 봄' },
    { c: 'Mozart Eine kleine Nachtmusik', title: '모차르트 – 아이네 클라이네 나흐트무지크' },
    { k: 'Wallpaper' },
    { c: 'Mendelssohn Wedding March', title: '멘델스존 – 결혼 행진곡' },
    { c: 'Joplin The Entertainer', title: '조플린 – 엔터테이너' },
    { k: 'Happy Alley' },
    { k: 'Life of Riley' },
    { c: 'Joplin Maple Leaf Rag', title: '조플린 – 메이플 리프 래그' },
    { k: 'Bright Wish' },
  ],
  epic: [
    { c: 'Elgar Pomp and Circumstance March No. 1', title: '엘가 – 위풍당당 행진곡 1번' },
    { k: 'Five Armies' },
    { c: 'Grieg In the Hall of the Mountain King', title: '그리그 – 산왕의 궁전에서' },
    { k: 'Heroic Age' },
    { c: 'Wagner Ride of the Valkyries', title: '바그너 – 발퀴레의 기행' },
    { c: 'Handel Hallelujah Messiah', title: '헨델 – 할렐루야' },
    { k: 'Crusade' },
    { c: 'Vivaldi Winter Four Seasons', title: '비발디 – 사계 중 겨울' },
  ],
  party: [
    { k: 'Pamgaea' },
    { k: 'Hyperfun' },
    { k: 'Funkorama' },
    { c: 'Offenbach Can-can Orpheus in the Underworld', title: '오펜바흐 – 캉캉' },
    { k: 'Cipher' },
    { k: 'Itty Bitty 8 Bit' },
    { c: 'Strauss Radetzky March', title: '슈트라우스 – 라데츠키 행진곡' },
  ],
  fun: [
    { k: 'Fluffing a Duck' },
    { k: 'Monkeys Spinning Monkeys' },
    { k: 'Sneaky Snitch' },
    { c: 'Rimsky-Korsakov Flight of the Bumblebee', title: '림스키코르사코프 – 왕벌의 비행' },
    { k: 'Investigations' },
  ],
};

async function getJSON(url, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'track'
  );
}
/** CC BY 출처 표기 문구 (곡명 · 작곡가 · 출처 · 라이선스) — 영상 엔딩에 그대로 표시됨 */
const creditFor = (title, license) => `"${title}" Kevin MacLeod (incompetech.com) · Licensed under ${license}`;
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Commons에서 퍼블릭 도메인/CC0 녹음 하나 찾기 (MIDI·너무 짧거나 큰 파일 제외) */
async function findCommons(query, log) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '12', gsrsearch: `${query} filetype:audio`,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName',
  });
  const j = await getJSON(`${COMMONS}?${q}`);
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const pg of pages) {
    const ii = pg.imageinfo?.[0];
    if (!ii) continue;
    const lic = strip(ii.extmetadata?.LicenseShortName?.value);
    const okLic = /public domain|^pd|cc0|cc-zero/i.test(lic) && !/\bby\b|cc-by|cc by/i.test(lic);
    const okMime = /^(audio\/(ogg|x-flac|flac|mpeg|wav|x-wav|webm)|application\/ogg|video\/webm)$/.test(ii.mime || '');
    if (!okLic || !okMime || ii.size < 800e3 || ii.size > 90e6) continue;
    return { url: ii.url, license: lic, credit: strip(ii.extmetadata?.Artist?.value).slice(0, 80), file: pg.title };
  }
  log(`  Commons '${query}': 조건에 맞는 퍼블릭 도메인 녹음 없음 (${pages.length}개 검색됨)`);
  return null;
}

/**
 * 분위기별 후보 목록 → [{ id, title, mood, url, license, credit, needsCredit, alt }]
 * alt: 분위기마다 want곡을 넘는 후보(앞의 곡을 받지 못했을 때 대체)
 */
async function fetchCatalog(log = () => {}) {
  const list = [];
  for (const mood of MOODS) {
    let n = 0;
    for (const c of CANDIDATES[mood.id]) {
      try {
        if (c.k) {
          const title = c.k;
          list.push({
            id: slug('kevin-macleod-' + title), title, mood: mood.id, url: INCOMPETECH + encodeURIComponent(title) + '.mp3',
            license: 'CC BY 4.0', needsCredit: true,
            credit: creditFor(title, 'CC BY 4.0'),
            commonsFallback: `Kevin MacLeod ${title}`, alt: n >= mood.want,
          });
          n++;
        } else {
          const f = await findCommons(c.c, log);
          if (!f) continue;
          log(`  Commons '${c.c}' → ${f.file} (${f.license})`);
          list.push({ id: slug(c.c), title: c.title, mood: mood.id, url: f.url, license: f.license, needsCredit: false, credit: f.credit ? `연주: ${f.credit} (퍼블릭 도메인)` : '퍼블릭 도메인', alt: n >= mood.want });
          n++;
        }
      } catch (e) {
        log(`  후보 '${c.k || c.c}' 확인 실패: ${e.message}`);
      }
    }
    log(`${mood.name}: 후보 ${n}곡`);
  }
  return list;
}

/** Kevin MacLeod 곡을 incompetech에서 못 받으면 Commons의 CC BY 사본을 찾음 */
async function findCommonsCcBy(query) {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '8', gsrsearch: `${query} filetype:audio`,
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: 'LicenseShortName',
  });
  const j = await getJSON(`${COMMONS}?${q}`);
  for (const pg of Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0))) {
    const ii = pg.imageinfo?.[0];
    const lic = strip(ii?.extmetadata?.LicenseShortName?.value);
    if (ii && /cc[ -]by/i.test(lic) && !/sa|nc|nd/i.test(lic.replace(/cc[ -]by/i, '')) && ii.size > 300e3 && /macleod/i.test(pg.title)) return { url: ii.url, license: lic };
  }
  return null;
}

function spread(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(((i + 0.5) * arr.length) / n)]);
  return out;
}

async function downloadTo(url, file, timeout = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 20000) throw new Error('파일이 너무 작습니다');
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = file + '.part';
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, file);
    return buf.length;
  } finally {
    clearTimeout(t);
  }
}

function readManifest(dir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    return Array.isArray(m.tracks) ? m.tracks : [];
  } catch {
    return [];
  }
}

function writeManifest(dir, tracks) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ source: SITE, license: LICENSE, updated: new Date().toISOString(), tracks }, null, 1));
}

/** 곡 하나 받기: 원래 주소 → (Kevin MacLeod 곡이면) Commons 사본 순으로 시도. 반환: 실제로 받은 주소·라이선스 */
async function downloadTrack(t, file) {
  try {
    await downloadTo(t.url, file);
    return { url: t.url, license: t.license };
  } catch (e) {
    if (!t.commonsFallback) throw e;
    const f = await findCommonsCcBy(t.commonsFallback);
    if (!f) throw new Error(e.message + ' · Commons 사본 없음');
    await downloadTo(f.url, file);
    return { url: f.url, license: f.license, credit: creditFor(t.title, f.license) };
  }
}

/**
 * 음원(mp3·ogg·flac) → AAC(.m4a) 변환 + 음량 평준화(loudnorm): 곡마다 소리 크기가 달라 영상 중간에 튀지 않게.
 * 반환: { file, duration } · 실패하면 throw
 */
function transcode(ffmpeg, src, dst) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-y', '-i', src, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dst];
    const p = spawn(ffmpeg, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-6000)));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg ' + code + ': ' + err.slice(-300)));
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      resolve({ file: dst, duration: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0 });
    });
  });
}

module.exports = { transcode, MOODS, CANDIDATES, LICENSE, SITE, fetchCatalog, downloadTo, downloadTrack, readManifest, writeManifest, spread, slug };
