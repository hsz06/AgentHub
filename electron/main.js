const { app, BrowserWindow, Notification, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  });
  window.loadURL(process.env.AGENTHUB_WEB_URL || 'http://localhost:8080');
}

ipcMain.handle('workspace:select-import', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled) return null;
  const directory = result.filePaths[0];
  const zip = new AdmZip();
  zip.addLocalFolder(directory);
  return { name: path.basename(directory), contentBase64: zip.toBuffer().toString('base64') };
});

ipcMain.handle('artifact:export', async (_event, { fileName, content }) => {
  const result = await dialog.showSaveDialog({ defaultPath: fileName });
  if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, content, 'utf8');
  return !result.canceled;
});

ipcMain.on('deployment:notify', (_event, title) => new Notification({ title: 'AgentHub deployment', body: title }).show());
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
