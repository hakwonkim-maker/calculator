// 무료 음악 라이브러리 (FreePD.com — 모든 곡 CC0 퍼블릭 도메인: 상업·공개 상영·SNS 사용 가능, 출처 표기 불필요)
// - 설치 파일 빌드 때(scripts/fetch-music.cjs) 미리 받아 resources/music-library 에 넣고
// - 빠졌거나 실패한 경우 프로그램 안에서 같은 방식으로 받아 사용자 폴더에 저장한다.
const fs = require('fs');
const path = require('path');

const SITE = process.env.MF_MUSIC_SITE || 'https://freepd.com/';
const LICENSE = 'CC0 1.0 (Public Domain) · FreePD.com';

// FreePD 카테고리 → 영상 분위기. want: 이 분위기에서 고를 곡 수 (합계 30)
const MOODS = [
  { id: 'warm', name: '따뜻·감동', keys: ['romantic'], want: 6 },
  { id: 'calm', name: '잔잔·서정', keys: ['scoring', 'misc'], want: 6 },
  { id: 'bright', name: '밝고 경쾌', keys: ['upbeat'], want: 6 },
  { id: 'epic', name: '웅장·벅참', keys: ['epic'], want: 5 },
  { id: 'party', name: '신나는', keys: ['electronic'], want: 4 },
  { id: 'fun', name: '유쾌·발랄', keys: ['comedy', 'world'], want: 3 },
];
const FALLBACK_PAGES = ['romantic.php', 'scoring.php', 'misc.php', 'upbeat.php', 'epic.php', 'electronic.php', 'comedy.php', 'world.php'];

async function getText(url, timeout = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'MEMORIA-Film-Studio' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/** 페이지 HTML에서 mp3 링크 추출 (상대 경로 → 절대 URL, 중복 제거, 페이지 순서 유지) */
function extractMp3(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const re = /["'(]([^"'()<>]+?\.mp3)["')]/gi;
  let m;
  while ((m = re.exec(html))) {
    let u;
    try {
      u = new URL(m[1].trim().replace(/&amp;/g, '&'), pageUrl).href;
    } catch {
      continue;
    }
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function titleFromUrl(u) {
  const f = decodeURIComponent(u.split('/').pop() || '').replace(/\.mp3$/i, '');
  return f.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'track'
  );
}

/** 목록에서 n개를 고르게 (앞쪽에 몰리지 않게) */
function spread(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(((i + 0.5) * arr.length) / n)]);
  return out;
}

/** FreePD에서 분위기별 곡 목록(최대 30곡)을 만든다. log: 진행 메시지 콜백 */
async function fetchCatalog(log = () => {}) {
  // 홈페이지의 링크에서 카테고리 페이지를 찾는다 (사이트 주소 체계가 바뀌어도 동작하도록 키워드로 판단)
  const keys = [...new Set(MOODS.flatMap((m) => m.keys))];
  const byPage = {};
  const pages = new Map(); // key → url
  let home = '';
  try {
    home = await getText(SITE);
    const links = [...home.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => {
      let url = '';
      try {
        url = new URL(m[1].replace(/&amp;/g, '&'), SITE).href;
      } catch {}
      return { url, text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() };
    });
    const same = links.filter((l) => l.url.startsWith(new URL(SITE).origin) && !/\.mp3($|\?)/i.test(l.url));
    log(`홈페이지 링크 ${same.length}개: ` + same.slice(0, 40).map((l) => `${l.text || '-'}→${l.url.replace(new URL(SITE).origin, '')}`).join(' | '));
    for (const k of keys) {
      const hit = same.find((l) => l.url.toLowerCase().includes(k)) || same.find((l) => l.text === k || l.text.startsWith(k));
      if (hit) pages.set(k, hit.url);
    }
    // 홈페이지에 바로 mp3가 있으면 '기타'로 사용
    const homeMp3 = extractMp3(home, SITE);
    if (homeMp3.length) {
      byPage.misc = homeMp3;
      log(`홈페이지: ${homeMp3.length}곡 발견`);
    }
  } catch (e) {
    log('홈페이지 읽기 실패: ' + e.message);
  }
  if (!pages.size && !Object.keys(byPage).length) for (const pg of FALLBACK_PAGES) pages.set(pg.replace(/\.php$/, ''), new URL(pg, SITE).href);
  for (const [key, url] of pages) {
    try {
      byPage[key] = extractMp3(await getText(url), url);
      log(`${key}: ${byPage[key].length}곡 발견 (${url})`);
    } catch (e) {
      log(`${key} 읽기 실패: ${e.message}`);
    }
  }
  if (!Object.values(byPage).some((v) => v.length)) log('곡을 찾지 못했습니다. 홈페이지 앞부분: ' + home.replace(/\s+/g, ' ').slice(0, 1500));
  // 분위기마다 필요한 곡 수의 2배를 후보로: 앞쪽(고르게 뽑은 want곡)이 본 목록, 나머지는 받기 실패 시 대체곡
  const used = new Set();
  const list = [];
  for (const mood of MOODS) {
    const pool = mood.keys.flatMap((k) => byPage[k] || []).filter((u) => !used.has(u));
    const cand = spread(pool, Math.min(pool.length, mood.want * 2));
    const ordered = [...cand.filter((_, i) => i % 2 === 0), ...cand.filter((_, i) => i % 2 === 1)];
    ordered.forEach((u, i) => {
      used.add(u);
      list.push({ id: slug(titleFromUrl(u)), title: titleFromUrl(u), mood: mood.id, url: u, license: LICENSE, alt: i >= mood.want });
    });
  }
  // id 중복 방지
  const ids = new Set();
  for (const t of list) {
    let id = t.id;
    for (let k = 2; ids.has(id); k++) id = `${t.id}-${k}`;
    ids.add(id);
    t.id = id;
  }
  return list;
}

async function downloadTo(url, file, timeout = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'MEMORIA-Film-Studio' } });
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

/**
 * mp3 → AAC(.m4a) 변환 + 음량 평준화(loudnorm): 곡마다 소리 크기가 달라 영상 중간에 튀지 않게.
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

module.exports = {
  transcode, MOODS, LICENSE, SITE, fetchCatalog, downloadTo, readManifest, writeManifest, extractMp3, titleFromUrl, spread };
