import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ldplCmms', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url: string) => ipcRenderer.invoke('set-server-url', url),
  isDesktop: true,
});
