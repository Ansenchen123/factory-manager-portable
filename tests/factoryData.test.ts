import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyFactoryData } from '../shared/schema';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

const { createFactoryDataSession, loadFactoryData, resolvePortableDataPath, restoreFactoryDataBackup, saveFactoryData, suggestNewFactoryDataPath } = await import('../electron/factoryData');

let tempDir: string;

beforeEach(async () => {
  const runtime = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-data/runtime');
  await fs.mkdir(runtime, { recursive: true });
  tempDir = await fs.mkdtemp(path.join(runtime, 'factory-data-test-'));
});

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(tempDir, { force: true, recursive: true });
});

describe('portable data path', () => {
  it('keeps Windows single-file portable data outside the extraction directory', () => {
    expect(resolvePortableDataPath({
      isPackaged: true, platform: 'win32', execPath: 'C:\\Temp\\extract\\Factory.exe',
      cwd: 'C:\\Temp', portableExecutableDir: 'D:\\Factory',
    })).toBe(path.win32.join('D:\\Factory', 'data', 'factory-data.json'));
  });
  it('uses the project data directory during development', () => {
    const projectDirectory = process.platform === 'win32' ? 'C:\\Project' : '/project';
    const appDirectory = process.platform === 'win32' ? 'C:\\App' : '/opt/factory-manager-portable';

    expect(
      resolvePortableDataPath({
        isPackaged: false,
        platform: process.platform,
        execPath: path.join(appDirectory, process.platform === 'win32' ? 'Factory.exe' : 'factory-manager-portable'),
        cwd: projectDirectory,
      }),
    ).toBe(path.join(projectDirectory, 'data', 'factory-data.json'));
  });

  it('uses the executable directory for packaged Windows and Linux builds', () => {
    const packagedPlatform = process.platform === 'win32' ? 'win32' : 'linux';
    const executableDirectory = packagedPlatform === 'win32' ? 'C:\\Factory' : '/opt/factory-manager-portable';
    const executableName = packagedPlatform === 'win32' ? 'Factory.exe' : 'factory-manager-portable';

    expect(
      resolvePortableDataPath({
        isPackaged: true,
        platform: packagedPlatform,
        execPath: path.join(executableDirectory, executableName),
        cwd: packagedPlatform === 'win32' ? 'C:\\Project' : '/project',
      }),
    ).toBe(path.join(executableDirectory, 'data', 'factory-data.json'));
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

describe('save file safety', () => {
  it('refuses to overwrite a file another program saved since it was read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'));
    const filePath = path.join(tempDir, 'factory.json');
    const first = await saveFactoryData(createEmptyFactoryData(), filePath);
    vi.setSystemTime(new Date('2026-10-14T00:00:01.000Z'));
    const other = await saveFactoryData({ ...first, productionLines: [] }, filePath, first.updatedAt);
    await expect(saveFactoryData(first, filePath, first.updatedAt)).rejects.toThrow('FACTORY_FILE_CHANGED');
    await expect(saveFactoryData(first, filePath, first.updatedAt)).rejects.toThrow('FACTORY_FILE_CHANGED');
    expect(JSON.parse(await fs.readFile(filePath, 'utf8')).updatedAt).toBe(other.updatedAt);
  });

  it('treats corrupt on-disk content as an external change during save', async () => {
    const filePath = path.join(tempDir, 'factory.json');
    const first = await saveFactoryData(createEmptyFactoryData(), filePath);
    await fs.writeFile(filePath, '{ broken', 'utf8');

    await expect(saveFactoryData(first, filePath, first.updatedAt)).rejects.toThrow('FACTORY_FILE_CHANGED');
    expect(await fs.readFile(filePath, 'utf8')).toBe('{ broken');
  });

  it('recreates a save file that was deleted after it was read', async () => {
    const filePath = path.join(tempDir, 'factory.json');
    const first = await saveFactoryData(createEmptyFactoryData(), filePath);
    await fs.rm(filePath);

    const recreated = await saveFactoryData(first, filePath, first.updatedAt);
    expect(await loadFactoryData(filePath)).toEqual(recreated);
  });

  it('restores the last good save and keeps the corrupt file', async () => {
    const filePath = path.join(tempDir, 'factory.json');
    const good = await saveFactoryData(createEmptyFactoryData(), filePath);
    await saveFactoryData(good, filePath);
    await fs.writeFile(filePath, '{ broken', 'utf8');
    await expect(loadFactoryData(filePath)).rejects.toThrow();
    const restored = await restoreFactoryDataBackup(filePath);
    expect(restored.data.schemaVersion).toBe(1);
    expect(await loadFactoryData(filePath)).toEqual(restored.data);
    expect((await fs.readdir(tempDir)).some(name => name.startsWith('factory.json.corrupt-'))).toBe(true);
  });

  it('suggests an unused file name and keeps a dated copy of a replaced file', async () => {
    const now = new Date(2026, 9, 14);
    const suggested = await suggestNewFactoryDataPath(tempDir, now);
    expect(path.basename(suggested)).toBe('工廠存檔-20261014.json');
    await saveFactoryData(createEmptyFactoryData(), suggested);
    expect(path.basename(await suggestNewFactoryDataPath(tempDir, now))).toBe('工廠存檔-20261014-2.json');
    await createFactoryDataSession(suggested);
    expect((await fs.readdir(tempDir)).some(name => name.includes('.replaced-'))).toBe(true);
  });
});
