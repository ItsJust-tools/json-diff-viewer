import type { Tool } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  DIFF_FILTERS,
  MAX_JSON_TEXT_LENGTH,
  type DiffFilter,
  type DiffViewMode,
  type JsonDiffState,
} from './types';

/** Result of validating a payload against the tool's state shape. */
type DeserializeResult<T> = { success: true; data: T } | { success: false; error: string };

const VIEW_MODES: readonly DiffViewMode[] = ['side-by-side', 'unified'];

/** Default state, also used by the storage/URL round trip. */
export const initialJsonDiffState: JsonDiffState = {
  leftText: '',
  rightText: '',
  viewMode: 'side-by-side',
  searchQuery: '',
  filter: 'all',
  showOnlyChanges: true,
  editorsVisible: true,
  wrapLines: false,
};

function isViewMode(value: unknown): value is DiffViewMode {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value);
}

function isFilter(value: unknown): value is DiffFilter {
  return typeof value === 'string' && (DIFF_FILTERS as readonly string[]).includes(value);
}

function clampText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.length > MAX_JSON_TEXT_LENGTH ? value.slice(0, MAX_JSON_TEXT_LENGTH) : value;
}

/**
 * Validate and normalize imported/shared state.
 * Every optional field falls back to its default so older payloads keep working.
 */
export function normalizeJsonDiffState(data: unknown): DeserializeResult<JsonDiffState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { success: false, error: 'Invalid data format: expected a JSON object' };
  }
  const value = data as Record<string, unknown>;

  const leftText = clampText(value.leftText);
  if (leftText === null) {
    return { success: false, error: 'Invalid data format: "leftText" must be a string' };
  }
  const rightText = clampText(value.rightText);
  if (rightText === null) {
    return { success: false, error: 'Invalid data format: "rightText" must be a string' };
  }

  const viewMode = value.viewMode ?? initialJsonDiffState.viewMode;
  if (!isViewMode(viewMode)) {
    return {
      success: false,
      error: 'Invalid data format: "viewMode" must be "side-by-side" or "unified"',
    };
  }

  const filter = value.filter ?? initialJsonDiffState.filter;
  if (!isFilter(filter)) {
    return { success: false, error: 'Invalid data format: "filter" is not a known change type' };
  }

  const searchQuery = value.searchQuery ?? initialJsonDiffState.searchQuery;
  if (typeof searchQuery !== 'string') {
    return { success: false, error: 'Invalid data format: "searchQuery" must be a string' };
  }

  const booleanField = (key: keyof JsonDiffState, fallback: boolean): boolean | null => {
    const raw = value[key];
    if (raw === undefined) return fallback;
    return typeof raw === 'boolean' ? raw : null;
  };

  const showOnlyChanges = booleanField('showOnlyChanges', initialJsonDiffState.showOnlyChanges);
  const editorsVisible = booleanField('editorsVisible', initialJsonDiffState.editorsVisible);
  const wrapLines = booleanField('wrapLines', initialJsonDiffState.wrapLines);
  if (showOnlyChanges === null || editorsVisible === null || wrapLines === null) {
    return {
      success: false,
      error:
        'Invalid data format: "showOnlyChanges", "editorsVisible", and "wrapLines" must be booleans',
    };
  }

  return {
    success: true,
    data: {
      leftText,
      rightText,
      viewMode,
      searchQuery,
      filter,
      showOnlyChanges,
      editorsVisible,
      wrapLines,
    },
  };
}

export const jsonDiffTool: Tool<JsonDiffState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: initialJsonDiffState,
  serialize: (state) => JSON.stringify(state, null, 2),
  deserialize: (data) => normalizeJsonDiffState(data),
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};
