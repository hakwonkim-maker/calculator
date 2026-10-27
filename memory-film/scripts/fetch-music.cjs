// 설치 파일 빌드 전에 무료(CC0) 음악 30곡을 받아 music-library/ 에 준비한다.
// 네트워크 문제로 실패해도 빌드는 계속된다 (프로그램 안에서 다시 받을 수 있음).
// 사용법: node scripts/fetch-music.cjs [출력폴더]
const path = require('path');
const fs = require('fs');
const os = require('os');
const lib = require('../electron/musiclib.cjs');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'music-library'));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const have = lib.readManifest(out);
  if (have.length >= 30 && have.every((t) => fs.existsSync(path.join(out, t.file)))) {
    console.log(`[music] 이미 ${have.length}곡 준비됨`);
    return;
  }
  let ffmpeg = null;
  try {
    ffmpeg = require('ffmpeg-static');
  } catch {}
  let catalog = [];
  try {
    catalog = await lib.fetchCatalog((m) => console.log('[music]', m));
  } catch (e) {
    console.log('[music] 목록을 받지 못했습니다:', e.message);
  }
  const tracks = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-music-'));
  const got = {};
  const wantOf = Object.fromEntries(lib.MOODS.map((m) => [m.id, m.want]));
  for (const t of catalog) {
    if ((got[t.mood] || 0) >= wantOf[t.mood]) continue; // 이 분위기는 이미 다 받음 → 대체곡 건너뜀
    const mp3 = path.join(tmpDir, t.id + '.mp3');
    try {
      const size = await lib.downloadTo(t.url, mp3);
      let file = t.id + '.mp3';
      let duration = 0;
      if (ffmpeg) {
        try {
          const r = await lib.transcode(ffmpeg, mp3, path.join(out, t.id + '.m4a'));
          file = t.id + '.m4a';
          duration = r.duration;
        } catch (e) {
          console.log('[music] 변환 실패, 원본 사용:', t.title, e.message);
          fs.copyFileSync(mp3, path.join(out, file));
        }
      } else fs.copyFileSync(mp3, path.join(out, file));
      got[t.mood] = (got[t.mood] || 0) + 1;
      tracks.push({ id: t.id, title: t.title, mood: t.mood, file, duration: Math.round(duration * 10) / 10, url: t.url, license: t.license });
      console.log(`[music] ✓ ${t.mood.padEnd(6)} ${t.title} (${(size / 1e6).toFixed(1)}MB, ${Math.round(duration)}s)`);
    } catch (e) {
      console.log('[music] ✗', t.title, e.message);
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  lib.writeManifest(out, tracks);
  const total = fs.readdirSync(out).reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0);
  console.log(`[music] 완료: ${tracks.length}곡, ${(total / 1e6).toFixed(1)}MB → ${out}`);
})().catch((e) => {
  console.log('[music] 오류 (빌드는 계속):', e.message);
  try {
    if (!fs.existsSync(path.join(out, 'manifest.json'))) lib.writeManifest(out, []);
  } catch {}
});
