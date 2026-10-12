import type { ExtensionSettings, Mode, SiteSettings, StoredSettings } from './settings';
export type PageAction = 'TOGGLE_PAGE' | 'PICK_TEXT' | 'CHECK_SELECTION' | 'CLEAR_PAGE';
export type ExtensionMessage =
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Partial<ExtensionSettings> }
  | { type: 'SAVE_SITE'; hostname: string; settings: SiteSettings }
  | { type: 'GET_STATE' }
  | { type: 'APPLY_SETTINGS'; settings: ExtensionSettings }
  | { type: 'PAGE_ACTION'; action: PageAction };
export interface PageState { mode: Mode; pageEnabled: boolean; picking: boolean; highlights: number; processed: number }
export interface ExtensionResponse { ok: boolean; error?: string; stored?: StoredSettings; state?: PageState }