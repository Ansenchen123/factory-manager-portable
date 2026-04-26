import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEmptyFactoryData, type FactoryData, validateFactoryData } from '../shared/schema';

export type DataPathOptions = {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  execPath: string;
  cwd: string;
};

export function resolvePortableDataPath(options: DataPathOptions): string {
  if (!options.isPackaged) {
    return path.join(options.cwd, 'data', 'factory-data.json');
  }

  if (options.platform === 'darwin') {
    return path.posix.resolve(path.posix.dirname(options.execPath), '..', '..', '..', 'data', 'factory-data.json');
  }

  return path.join(path.dirname(options.execPath), 'data', 'factory-data.json');
}

export function getFactoryDataPath(): string {
  return resolvePortableDataPath({
    isPackaged: app.isPackaged,
    platform: process.platform,
    execPath: process.execPath,
    cwd: process.cwd(),
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

export async function saveFactoryData(data: FactoryData, filePath = getFactoryDataPath()): Promise<FactoryData> {
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

export async function createFactoryDataSession(filePath: string): Promise<FactoryDataSession> {
  const data = await saveFactoryData(createEmptyFactoryData(), filePath);

  return {
    data,
    path: filePath,
  };
}
