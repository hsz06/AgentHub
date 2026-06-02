const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentHubDesktop', {
  selectImportDirectory: () => ipcRenderer.invoke('workspace:select-import'),
  exportArtifact: payload => ipcRenderer.invoke('artifact:export', payload),
  notifyDeployment: title => ipcRenderer.send('deployment:notify', title)
});

