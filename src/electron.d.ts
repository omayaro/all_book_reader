import type { ElectronApi } from './api';

declare global {
  interface Window {
    api: ElectronApi;
  }
}

export {};
