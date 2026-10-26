export { default as toolConfig } from './tool.config';
export { templateBaseVersion } from './tool.config';
export { templateMetadata, getPublicSiteUrl } from './template-metadata';
export { jsonDiffTool, initialJsonDiffState, normalizeJsonDiffState } from './tool-definition';
export { ToolCanvas } from './components/tool-canvas';
export { ToolToolbar } from './components/tool-toolbar';
export { ToolSidebar } from './components/tool-sidebar';
export type {
  DiffFilter,
  DiffReportFormat,
  DiffViewMode,
  JsonDiffActions,
  JsonDiffState,
  JsonSide,
} from './types';
export { DIFF_FILTER_LABELS, DIFF_FILTERS, MAX_JSON_TEXT_LENGTH } from './types';
export type {
  DiffChangeType,
  DiffEntry,
  DiffResult,
  DiffStats,
  JsonKind,
  ParsedJson,
  PathSegment,
} from './lib/json-diff';
export {
  deepEqual,
  diffJsonText,
  filterEntries,
  formatPath,
  parseJsonDocument,
  previewValue,
  summarize,
  truncatePath,
} from './lib/json-diff';
export type { DiffReport } from './lib/diff-report';
export { buildDiffReport, reportToJson, reportToMarkdown } from './lib/diff-report';
export { downloadTextFile, reportFilename } from './lib/download';
export { SAMPLE_LEFT, SAMPLE_RIGHT } from './lib/sample';
