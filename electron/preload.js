const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentHubDesktop', {
  selectImportDirectory: () => ipcRenderer.invoke('workspace:select-import'),
  exportArtifact: payload => ipcRenderer.invoke('artifact:export', payload),
  exportText: payload => ipcRenderer.invoke('text:export', payload),
  notifyDeployment: title => ipcRenderer.send('deployment:notify', title),
  notifyAgentRun: title => ipcRenderer.send('agent-run:notify', title)
});
