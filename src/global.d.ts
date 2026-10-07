/// <reference types="vite/client" />
import type { FactoryData } from '../shared/schema';
import type { UpdateApi } from '../shared/updates';

type FactoryDataSession = {
  data: FactoryData;
  path: string;
};

declare global {
  interface Window {
    appUpdates?: UpdateApi;
    factoryData: {
      createNew: () => Promise<FactoryDataSession | null>;
      open: () => Promise<FactoryDataSession | null>;
      loadDefault: () => Promise<FactoryDataSession>;
      save: (data: FactoryData) => Promise<FactoryDataSession>;
      getDataPath: () => Promise<string>;
    };
  }
}

export {};
