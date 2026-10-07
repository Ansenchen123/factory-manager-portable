import { contextBridge, ipcRenderer } from 'electron';
import type { FactoryData } from '../shared/schema';
import type { FactoryDataSession } from './factoryData';
import type { UpdateApi, UpdateState } from '../shared/updates';

contextBridge.exposeInMainWorld('appUpdates', {
  getState: () => ipcRenderer.invoke('app-update:state'),
  check: () => ipcRenderer.invoke('app-update:check'),
  download: () => ipcRenderer.invoke('app-update:download'),
  install: () => ipcRenderer.invoke('app-update:install'),
  openRelease: () => ipcRenderer.invoke('app-update:open'),
  onState: (callback: (state: UpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on('app-update:state', listener);
    return () => ipcRenderer.removeListener('app-update:state', listener);
  },
} satisfies UpdateApi);

contextBridge.exposeInMainWorld('factoryData', {
  createNew: () => ipcRenderer.invoke('factory-data:create-new') as Promise<FactoryDataSession | null>,
  open: () => ipcRenderer.invoke('factory-data:open') as Promise<FactoryDataSession | null>,
  loadDefault: () => ipcRenderer.invoke('factory-data:load-default') as Promise<FactoryDataSession>,
  save: (data: FactoryData) => ipcRenderer.invoke('factory-data:save', data) as Promise<FactoryDataSession>,
  getDataPath: () => ipcRenderer.invoke('factory-data:get-path') as Promise<string>,
});
