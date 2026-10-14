import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEmptyFactoryData, type FactoryData, fileChangedCode, validateFactoryData } from '../shared/schema';

export type DataPathOptions = {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  execPath: string;
  cwd: string;
  portableExecutableDir?: string;
};

export function resolvePortableDataPath(options: DataPathOptions): string {
  if (!options.isPackaged) {
    return path.join(options.cwd, 'data', 'factory-data.json');
  }

  if (options.platform === 'darwin') {
    return path.posix.resolve(path.posix.dirname(options.execPath), '..', '..', '..', 'data', 'factory-data.json');
  }

  // electron-builder's portable launcher extracts the executable into a temporary
  // directory and exposes the original location through this environment value.
  if (options.platform === 'win32' && options.portableExecutableDir) {
    return path.win32.join(options.portableExecutableDir, 'data', 'factory-data.json');
  }

  return path.join(path.dirname(options.execPath), 'data', 'factory-data.json');
}

export function getFactoryDataPath(): string {
  return resolvePortableDataPath({
    isPackaged: app.isPackaged,
    platform: process.platform,
    execPath: process.execPath,
    cwd: process.cwd(),
    portableExecutableDir: process.env.PORTABLE_EXECUTABLE_DIR,
  });
}

async function ensureWritableDirectory(filePath: string): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  await fs.access(directory, fs.constants.W_OK);
}

export async function loadFactoryData(filePath = getFactoryDataPath()): Promise<FactoryData> {
  await ensureWritableDirectory(filePath);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return validateFactoryData(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code !== 'ENOENT') {
      throw error;
    }

    const emptyData = createEmptyFactoryData();
    return saveFactoryData(emptyData, filePath);
  }
}

async function readUpdatedAt(filePath: string): Promise<string | undefined> {
  try {
    return (JSON.parse(await fs.readFile(filePath, 'utf8')) as { updatedAt?: string }).updatedAt ?? '';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return '';
  }
}

export async function saveFactoryData(data: FactoryData, filePath = getFactoryDataPath(), expectedUpdatedAt?: string): Promise<FactoryData> {
  if (expectedUpdatedAt !== undefined) {
    const current = await readUpdatedAt(filePath);
    if (current !== undefined && current !== expectedUpdatedAt) throw new Error(fileChangedCode);
  }

  const validData = validateFactoryData({
    ...data,
    updatedAt: new Date().toISOString(),
  });

  await ensureWritableDirectory(filePath);

  const backupPath = `${filePath}.bak`;
  const temporaryPath = `${filePath}.tmp`;

  try {
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.writeFile(temporaryPath, `${JSON.stringify(validData, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);

  return validData;
}

export type FactoryDataSession = {
  data: FactoryData;
  path: string;
};

export async function loadFactoryDataSession(filePath = getFactoryDataPath()): Promise<FactoryDataSession> {
  return {
    data: await loadFactoryData(filePath),
    path: filePath,
  };
}

function timestampForFile(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

// Suggests a new file beside the current one so "new" never targets existing data by default.
export async function suggestNewFactoryDataPath(directory: string, now = new Date()): Promise<string> {
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  for (let index = 1; ; index++) {
    const candidate = path.join(directory, `工廠存檔-${day}${index > 1 ? `-${index}` : ''}.json`);
    try { await fs.access(candidate); } catch { return candidate; }
  }
}

export async function readFactoryDataBackup(filePath: string): Promise<FactoryData | undefined> {
  try {
    return validateFactoryData(JSON.parse(await fs.readFile(`${filePath}.bak`, 'utf8')));
  } catch {
    return undefined;
  }
}

// Keeps the unreadable file for inspection, then puts the last good save back in place.
export async function restoreFactoryDataBackup(filePath: string): Promise<FactoryDataSession> {
  const backup = await readFactoryDataBackup(filePath);
  if (!backup) throw new Error('沒有可用的備份。');
  await fs.copyFile(filePath, `${filePath}.corrupt-${timestampForFile()}`).catch(() => undefined);
  await fs.copyFile(`${filePath}.bak`, filePath);
  return { data: backup, path: filePath };
}

export async function createFactoryDataSession(filePath: string): Promise<FactoryDataSession> {
  // The save dialog already confirmed replacement; keep a dated copy because .bak rotates on the next save.
  await fs.copyFile(filePath, `${filePath}.replaced-${timestampForFile()}.bak`).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  const data = await saveFactoryData(createEmptyFactoryData(), filePath);

  return {
    data,
    path: filePath,
  };
}
