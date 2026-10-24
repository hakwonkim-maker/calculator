// MEMORIA Film Studio — Electron 메인 프로세스
// 역할: 창 관리, 파일/폴더 선택, 사진 스캔(EXIF 촬영일), 로컬 미디어 제공(media://), FFmpeg 인코딩
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, powerSaveBlocker, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Exporter } = require('./exporter.cjs');

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
      const r = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['계속 만들기', '중단하고 종료'],
        defaultId: 0,
        cancelId: 0,
        message: '영상을 만드는 중입니다.',
        detail: '지금 종료하면 영상 파일이 완성되지 않습니다.',
      });
      if (r === 0) e.preventDefault();
      else exporter.cancel();
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
});

app.on('window-all-closed', () => app.quit());

// ---------------- 사진 스캔 ----------------
let exifr = null;
async function readDate(file, stat) {
  try {
    exifr = exifr || require('exifr');
    const d = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'], translateValues: true, reviveValues: true });
    const v = d?.DateTimeOriginal || d?.CreateDate || d?.ModifyDate;
    if (v instanceof Date && !isNaN(v)) return { date: v.getTime(), dateSource: 'exif' };
  } catch {
    /* EXIF 없음 */
  }
  return { date: stat.mtimeMs, dateSource: 'file' };
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

async function describeFiles(files) {
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
        const d = await readDate(f, st);
        photos.push({ path: f, name: path.basename(f), size: st.size, ...d });
      } catch {
        skipped.push({ path: f, reason: '읽기 실패' });
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  photos.sort((a, b) => a.path.localeCompare(b.path, 'ko', { numeric: true }));
  return { photos, skipped };
}

ipcMain.handle('scan:paths', async (_e, paths, recursive = true) => {
  const files = [];
  for (const p of paths) {
    try {
      const st = await fs.promises.stat(p);
      if (st.isDirectory()) await walk(p, recursive, files);
      else files.push(p);
    } catch {
      /* 무시 */
    }
  }
  return describeFiles(files);
});

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

ipcMain.handle('shell:showItem', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('shell:openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('app:info', () => ({ version: app.getVersion(), videos: app.getPath('videos'), platform: process.platform }));

// ---------------- 내보내기 (FFmpeg) ----------------
ipcMain.handle('export:start', async (_e, opts) => {
  if (exporter && exporter.running) throw new Error('이미 내보내기가 진행 중입니다.');
  exporter = new Exporter(opts);
  await exporter.start();
  psbId = powerSaveBlocker.start('prevent-app-suspension');
  return true;
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
  }
  return true;
});
