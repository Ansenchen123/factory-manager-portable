import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyFactoryData } from '../shared/schema';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

const { loadFactoryData, resolvePortableDataPath, saveFactoryData } = await import('../electron/factoryData');

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-data-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe('portable data path', () => {
  it('uses the project data directory during development', () => {
    expect(
      resolvePortableDataPath({
        isPackaged: false,
        platform: 'win32',
        execPath: 'C:\\App\\Factory.exe',
        cwd: 'C:\\Project',
      }),
    ).toBe(path.join('C:\\Project', 'data', 'factory-data.json'));
  });

  it('uses the executable directory for packaged Windows and Linux builds', () => {
    expect(
      resolvePortableDataPath({
        isPackaged: true,
        platform: 'win32',
        execPath: 'C:\\Factory\\Factory.exe',
        cwd: 'C:\\Project',
      }),
    ).toBe(path.join('C:\\Factory', 'data', 'factory-data.json'));
  });

  it('uses a folder next to the app bundle for packaged macOS builds', () => {
    expect(
      resolvePortableDataPath({
        isPackaged: true,
        platform: 'darwin',
        execPath: '/Applications/Factory Manager Portable.app/Contents/MacOS/Factory Manager Portable',
        cwd: '/Project',
      }),
    ).toBe('/Applications/data/factory-data.json');
  });
});

describe('factory data persistence', () => {
  it('creates an empty data file on first load', async () => {
    const filePath = path.join(tempDir, 'data', 'factory-data.json');
    const data = await loadFactoryData(filePath);
    const fileContent = await fs.readFile(filePath, 'utf8');

    expect(data.schemaVersion).toBe(1);
    expect(data.productionLines).toEqual([]);
    expect(JSON.parse(fileContent)).toEqual(data);
  });

  it('saves data and creates a backup of the previous file', async () => {
    const filePath = path.join(tempDir, 'data', 'factory-data.json');
    const firstData = createEmptyFactoryData(new Date('2026-04-01T00:00:00.000Z'));
    const secondData = {
      ...firstData,
      productionLines: [
        {
          id: 'line-1',
          name: 'A線',
          machines: [],
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    };

    await saveFactoryData(firstData, filePath);
    await saveFactoryData(secondData, filePath);

    const saved = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const backup = JSON.parse(await fs.readFile(`${filePath}.bak`, 'utf8'));

    expect(saved.productionLines).toHaveLength(1);
    expect(backup.productionLines).toHaveLength(0);
  });
});
