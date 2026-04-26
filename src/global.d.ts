import type { FactoryData } from '../shared/schema';

type FactoryDataSession = {
  data: FactoryData;
  path: string;
};

declare global {
  interface Window {
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
