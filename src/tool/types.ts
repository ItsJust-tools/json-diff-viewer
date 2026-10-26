/** Layout used to present the comparison. */
export type DiffViewMode = 'side-by-side' | 'unified';

/** Change types that can be used to filter the visible rows. */
export type DiffFilter = 'all' | 'added' | 'removed' | 'modified' | 'unchanged';

/** The two JSON input panes. */
export type JsonSide = 'left' | 'right';

/** Report formats offered by the explicit report download buttons. */
export type DiffReportFormat = 'json' | 'markdown';

/**
 * Serializable state of the JSON diff viewer.
 * Every field is plain JSON so the whole session can be shared, imported,
 * exported, and restored without extra encoding.
 */
export interface JsonDiffState {
  /** Raw text of the original (left) document. */
  leftText: string;
  /** Raw text of the modified (right) document. */
  rightText: string;
  /** Whether values are shown in two columns or one unified column. */
  viewMode: DiffViewMode;
  /** Free-text search across paths and values. */
  searchQuery: string;
  /** Only show rows of this change type. */
  filter: DiffFilter;
  /** Hide rows that are structurally unchanged. */
  showOnlyChanges: boolean;
  /** Show the two JSON editor panes above the diff. */
  editorsVisible: boolean;
  /** Allow long values to wrap instead of being clamped to one line. */
  wrapLines: boolean;
}

/** Callbacks used by the canvas, toolbar, and sidebar. */
export interface JsonDiffActions {
  setLeftText: (text: string) => void;
  setRightText: (text: string) => void;
  setViewMode: (mode: DiffViewMode) => void;
  setSearchQuery: (value: string) => void;
  setFilter: (filter: DiffFilter) => void;
  setShowOnlyChanges: (value: boolean) => void;
  setEditorsVisible: (value: boolean) => void;
  setWrapLines: (value: boolean) => void;
  formatBoth: () => void;
  loadSample: () => void;
  clearAll: () => void;
  exportReport: (format: DiffReportFormat) => void;
}

/** Maximum characters accepted per input pane before the text is truncated. */
export const MAX_JSON_TEXT_LENGTH = 200_000;

/** Keys shown in the filter dropdown, in display order. */
export const DIFF_FILTERS: readonly DiffFilter[] = [
  'all',
  'added',
  'removed',
  'modified',
  'unchanged',
] as const;

/** Human-readable labels for change filters. */
export const DIFF_FILTER_LABELS: Record<DiffFilter, string> = {
  all: 'All rows',
  added: 'Added only',
  removed: 'Removed only',
  modified: 'Modified only',
  unchanged: 'Unchanged only',
};
