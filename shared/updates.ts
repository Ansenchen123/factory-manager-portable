export type UpdateRelease = { version: string; notes: string; url: string; size: number; sha256: string };
export type UpdateState = {
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
  currentVersion: string;
  canInstall: boolean;
  release?: UpdateRelease;
  percent?: number;
  message?: string;
};

export type UpdateApi = {
  getState: () => Promise<UpdateState>;
  check: () => Promise<UpdateState>;
  download: () => Promise<UpdateState>;
  install: () => Promise<void>;
  openRelease: () => Promise<void>;
  onState: (callback: (state: UpdateState) => void) => () => void;
};
