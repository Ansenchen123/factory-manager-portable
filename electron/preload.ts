import { contextBridge, ipcRenderer } from 'electron';
import type { FactoryData } from '../shared/schema';
import type { FactoryDataSession } from './factoryData';

contextBridge.exposeInMainWorld('factoryData', {
  createNew: () => ipcRenderer.invoke('factory-data:create-new') as Promise<FactoryDataSession | null>,
  open: () => ipcRenderer.invoke('factory-data:open') as Promise<FactoryDataSession | null>,
  loadDefault: () => ipcRenderer.invoke('factory-data:load-default') as Promise<FactoryDataSession>,
  save: (data: FactoryData) => ipcRenderer.invoke('factory-data:save', data) as Promise<FactoryDataSession>,
  getDataPath: () => ipcRenderer.invoke('factory-data:get-path') as Promise<string>,
});
