// MEMORIA Film Studio — Electron 메인 프로세스
// 역할: 창 관리, 파일/폴더 선택, 사진 스캔(EXIF 촬영일), 로컬 미디어 제공(media://), FFmpeg 인코딩
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, powerSaveBlocker, Menu, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Exporter, detectEncoders, ENCODER_LABEL, ffmpegPath } = require('./exporter.cjs');
const musiclib = require('./musiclib.cjs');

const isDev = process.argv.includes('--dev');
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.avif', '.jfif']);
const UNSUPPORTED_IMAGE_EXT = new Set(['.heic', '.heif', '.tif', '.tiff', '.raw', '.cr2', '.nef', '.arw', '.dng', '.psd']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac']);

// GPU가 없거나 드라이버가 차단된 PC(구형 사무용 PC, 가상머신)에서도 WebGL2가 동작하도록
// 소프트웨어 렌더링(SwiftShader) 폴백을 허용한다. GPU가 있으면 GPU를 그대로 사용한다.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
]);

let win = null;
let exporter = null;
let psbId = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#0d0c0a',
    title: 'MEMORIA 기념영상 스튜디오',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // 내보내기 중 창을 최소화해도 렌더링이 느려지지 않도록
    },
  });
  win.once('ready-to-show', () => win.show());
  if (isDev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));

  win.on('close', (e) => {
    if (exporter && exporter.running) {
      e.preventDefault();
      const r = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['계속 만들기', '중단하고 종료'],
        defaultId: 0,
        cancelId: 0,
        message: '영상을 만드는 중입니다.',
        detail: '지금 종료하면 영상 파일이 완성되지 않습니다.',
      });
      if (r === 1) exporter.cancel().finally(() => win.destroy());
    }
  });
}

app.whenReady().then(() => {
  protocol.handle('media', (req) => {
    const url = new URL(req.url);
    const p = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const ext = path.extname(p).toLowerCase();
    if (!IMAGE_EXT.has(ext) && !AUDIO_EXT.has(ext)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(p).toString());
  });
  if (!isDev) Menu.setApplicationMenu(null);
  createWindow();
  // 하드웨어 인코더는 미리 조용히 확인 (내보내기 시작이 늦어지지 않도록)
  setTimeout(() => detectEncoders().catch(() => {}), 4000);
});

app.on('window-all-closed', () => app.quit());

// ---------------- 사진 스캔 ----------------
let exifr = null;
const { inferDate } = require('./photodate.cjs');
async function readDate(file, stat, root) {
  let exif = {};
  try {
    exifr = exifr || require('exifr');
    const d = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'], translateValues: true, reviveValues: true });
    exif = { original: d?.DateTimeOriginal, create: d?.CreateDate, modify: d?.ModifyDate };
  } catch {
    /* EXIF 없음 */
  }
  // 복사하면 '만든 날짜'는 복사한 날로 바뀌고 '수정한 날짜'는 유지되므로 더 이른 쪽을 씀
  const times = [stat.mtimeMs, stat.birthtimeMs].filter((t) => t > 0);
  return inferDate({ file, root, exif, fileTime: times.length ? Math.min(...times) : Date.now() });
}

async function walk(dir, recursive, out, depth = 0) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive && depth < 6) await walk(full, recursive, out, depth + 1);
    } else out.push(full);
  }
}

let sizeOf = null;
async function readSize(file) {
  try {
    sizeOf = sizeOf || require('image-size/fromFile').imageSizeFromFile;
    const d = await sizeOf(file);
    // EXIF 방향 5~8 = 90° 회전 → 가로세로 교환
    const swap = (d.orientation || 0) >= 5;
    return { w: (swap ? d.height : d.width) || 0, h: (swap ? d.width : d.height) || 0 };
  } catch {
    return { w: 0, h: 0 };
  }
}

async function describeFiles(files, roots = new Map()) {
  const photos = [];
  const skipped = [];
  const queue = files.slice();
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const ext = path.extname(f).toLowerCase();
      if (UNSUPPORTED_IMAGE_EXT.has(ext)) {
        skipped.push({ path: f, reason: ext.replace('.', '').toUpperCase() });
        continue;
      }
      if (!IMAGE_EXT.has(ext)) continue;
      try {
        const st = await fs.promises.stat(f);
        if (st.size < 2048) continue;
        const [d, dim] = await Promise.all([readDate(f, st, roots.get(f) || null), readSize(f)]);
        photos.push({ path: f, name: path.basename(f), size: st.size, ...d, ...dim });
      } catch {
        skipped.push({ path: f, reason: '읽기 실패' });
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  // 촬영일순 (같으면 파일명순)
  photos.sort((a, b) => a.date - b.date || a.path.localeCompare(b.path, 'ko', { numeric: true }));
  return { photos, skipped };
}

ipcMain.handle('scan:paths', async (_e, paths, recursive = true) => {
  const files = [];
  const roots = new Map(); // 파일 → 사용자가 고른 폴더 (폴더 이름 연도는 이 안에서만 봄)
  for (const p of paths) {
    try {
      const st = await fs.promises.stat(p);
      if (st.isDirectory()) {
        const n = files.length;
        await walk(p, recursive, files);
        for (const f of files.slice(n)) roots.set(f, p);
      } else files.push(p);
    } catch {
      /* 무시 */
    }
  }
  return describeFiles(files, roots);
});

// 이미 불러온 사진의 날짜를 새 규칙으로 다시 계산 (이전 버전 프로젝트의 촬영일순 정렬 보정)
ipcMain.handle('photos:dates', async (_e, paths) =>
  Promise.all(
    paths.map(async (f) => {
      try {
        return await readDate(f, await fs.promises.stat(f), null);
      } catch {
        return null;
      }
    }),
  ),
);

// ---------------- 대화상자 ----------------
ipcMain.handle('dialog:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { title: '사진 폴더 선택', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:pickPhotos', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '사진 선택',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '사진', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif', 'jfif', 'heic'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('dialog:pickAudio', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '배경음악 선택',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '오디오', extensions: [...AUDIO_EXT].map((e) => e.slice(1)) }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('dialog:pickImage', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '로고 이미지 선택 (투명 배경 PNG 권장)',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'webp', 'jpg', 'jpeg'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:saveVideo', async (_e, defaultName) => {
  const r = await dialog.showSaveDialog(win, {
    title: '영상 저장 위치',
    defaultPath: path.join(app.getPath('videos'), defaultName || '기념영상.mp4'),
    filters: [{ name: 'MP4 동영상', extensions: ['mp4'] }],
  });
  return r.canceled ? null : r.filePath;
});

// ---------------- 프로젝트 저장/열기 ----------------
ipcMain.handle('project:save', async (_e, json, filePath, defaultName) => {
  let p = filePath;
  if (!p) {
    const r = await dialog.showSaveDialog(win, {
      title: '프로젝트 저장',
      defaultPath: path.join(app.getPath('documents'), (defaultName || '기념영상') + '.memoria'),
      filters: [{ name: 'MEMORIA 프로젝트', extensions: ['memoria'] }],
    });
    if (r.canceled) return null;
    p = r.filePath;
  }
  await fs.promises.writeFile(p, json, 'utf8');
  return p;
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '프로젝트 열기',
    properties: ['openFile'],
    filters: [{ name: 'MEMORIA 프로젝트', extensions: ['memoria', 'json'] }],
  });
  if (r.canceled) return null;
  const json = await fs.promises.readFile(r.filePaths[0], 'utf8');
  return { path: r.filePaths[0], json };
});

ipcMain.handle('fs:exists', async (_e, paths) => Promise.all(paths.map((p) => fs.promises.access(p).then(() => true, () => false))));

// ---------------- 무료 음악 라이브러리 ----------------
// 설치 파일에 들어 있는 곡(resources/music-library) + 프로그램에서 받은 곡(사용자 폴더)
const bundledMusicDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'music-library') : path.join(__dirname, '..', 'music-library'));
const userMusicDir = () => process.env.MF_MUSIC_DIR || path.join(app.getPath('userData'), 'music-library');
let onlineCatalog = null;

function libraryTracks() {
  const out = new Map();
  for (const dir of [bundledMusicDir(), userMusicDir()]) {
    for (const t of musiclib.readManifest(dir)) {
      const p = path.join(dir, t.file);
      if (!out.has(t.id) && fs.existsSync(p)) out.set(t.id, { ...t, path: p, local: true });
    }
  }
  return [...out.values()];
}

ipcMain.handle('music:library', () => {
  const local = libraryTracks();
  const ids = new Set(local.map((t) => t.id));
  // 이미 받은 곡 + 아직 안 받은 곡을 합쳐 30곡까지 (받기 실패에 대비한 대체곡은 자리가 남을 때만)
  const cand = (onlineCatalog || []).filter((t) => !ids.has(t.id));
  const online = [...cand.filter((t) => !t.alt), ...cand.filter((t) => t.alt)].slice(0, Math.max(0, 30 - local.length)).map((t) => ({ ...t, local: false }));
  return { moods: musiclib.MOODS.map(({ id, name }) => ({ id, name })), tracks: [...local, ...online], license: musiclib.LICENSE };
});

ipcMain.handle('music:fetchOnline', async () => {
  try {
    onlineCatalog = await musiclib.fetchCatalog();
    return { ok: onlineCatalog.length > 0, count: onlineCatalog.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

const downloading = new Map();
ipcMain.handle('music:download', (_e, id) => {
  if (downloading.has(id)) return downloading.get(id);
  const job = (async () => {
    const have = libraryTracks().find((t) => t.id === id);
    if (have) return have;
    const t = (onlineCatalog || []).find((x) => x.id === id);
    if (!t) throw new Error('곡 정보를 찾을 수 없습니다');
    const dir = userMusicDir();
    fs.mkdirSync(dir, { recursive: true });
    const mp3 = path.join(dir, t.id + '.download.mp3');
    await musiclib.downloadTo(t.url, mp3);
    let file = t.id + '.m4a';
    let duration = 0;
    try {
      duration = (await musiclib.transcode(ffmpegPath(), mp3, path.join(dir, file))).duration;
      fs.rmSync(mp3, { force: true });
    } catch {
      file = t.id + '.mp3';
      fs.renameSync(mp3, path.join(dir, file));
    }
    const entry = { id: t.id, title: t.title, mood: t.mood, file, duration: Math.round(duration * 10) / 10, url: t.url, license: t.license };
    const list = musiclib.readManifest(dir).filter((x) => x.id !== id);
    musiclib.writeManifest(dir, [...list, entry]);
    return { ...entry, path: path.join(dir, file), local: true };
  })().finally(() => downloading.delete(id));
  downloading.set(id, job);
  return job;
});

ipcMain.handle('shell:showItem', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('app:info', () => ({ version: app.getVersion(), videos: app.getPath('videos'), platform: process.platform }));

// ---------------- 내보내기 (FFmpeg) ----------------
ipcMain.handle('export:encoders', async () => {
  const hw = await detectEncoders().catch(() => []);
  return { hw, labels: ENCODER_LABEL };
});

ipcMain.handle('export:start', async (_e, opts) => {
  if (exporter && exporter.running) throw new Error('이미 내보내기가 진행 중입니다.');
  let encoder = 'libx264';
  if (opts.encoder !== 'cpu') {
    const hw = await detectEncoders().catch(() => []);
    if (hw.length) encoder = hw[0];
    // 테스트용: 하드웨어 인코더 실패 → CPU 자동 전환 경로 검증
    if (process.env.MF_FORCE_ENCODER) encoder = process.env.MF_FORCE_ENCODER;
  }
  exporter = new Exporter({ ...opts, encoder });
  await exporter.start();
  psbId = powerSaveBlocker.start('prevent-app-suspension');
  return { encoder, label: ENCODER_LABEL[encoder] || encoder };
});

ipcMain.handle('export:progress', (_e, ratio) => {
  if (win && !win.isDestroyed()) win.setProgressBar(ratio < 0 ? -1 : Math.min(1, ratio));
});

ipcMain.handle('export:notifyDone', (_e, title, body) => {
  if (!win || win.isDestroyed()) return;
  win.setProgressBar(-1);
  if (!win.isFocused()) {
    win.flashFrame(true);
    if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
  }
});

// 저장 위치의 남은 디스크 공간 (바이트)
ipcMain.handle('fs:free', async (_e, p) => {
  try {
    const st = await fs.promises.statfs(path.dirname(p));
    return st.bavail * st.bsize;
  } catch {
    return -1;
  }
});

ipcMain.handle('export:frame', async (_e, data) => {
  if (!exporter) throw new Error('내보내기가 시작되지 않았습니다.');
  await exporter.writeFrame(data);
  return true;
});

const stopPsb = () => {
  if (psbId != null && powerSaveBlocker.isStarted(psbId)) powerSaveBlocker.stop(psbId);
  psbId = null;
};

ipcMain.handle('export:finish', async () => {
  try {
    const r = await exporter.finish();
    return r;
  } finally {
    stopPsb();
  }
});

ipcMain.handle('export:cancel', async () => {
  try {
    if (exporter) await exporter.cancel();
  } finally {
    stopPsb();
    if (win && !win.isDestroyed()) win.setProgressBar(-1);
  }
  return true;
});
