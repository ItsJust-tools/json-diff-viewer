import type { DiffEntry, DiffResult, DiffStats, ParsedJson } from './json-diff';
import { truncatePath } from './json-diff';
import type { DiffViewMode } from '../types';

/** A serializable diff report, suitable for download or clipboard copy. */
export interface DiffReport {
  tool: string;
  version: string;
  generatedAt: string;
  viewMode: DiffViewMode;
  summary: DiffStats;
  inputs: {
    left: { status: ParsedJson['status']; error: string | null };
    right: { status: ParsedJson['status']; error: string | null };
  };
  changes: Array<{
    path: string;
    type: DiffEntry['type'];
    leftKind: DiffEntry['leftKind'];
    rightKind: DiffEntry['rightKind'];
    left: string;
    right: string;
  }>;
}

const CHANGE_LABELS: Record<DiffEntry['type'], string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  unchanged: 'Unchanged',
};

function inputSummary(parsed: ParsedJson): { status: ParsedJson['status']; error: string | null } {
  return { status: parsed.status, error: parsed.error };
}

/**
 * Build a report object from a diff result.
 *
 * Unchanged rows are omitted from `changes` so reports stay focused on what
 * actually differs; the summary still counts them.
 */
export function buildDiffReport(
  result: DiffResult,
  options: { tool: string; version: string; viewMode: DiffViewMode; generatedAt?: string }
): DiffReport {
  return {
    tool: options.tool,
    version: options.version,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    viewMode: options.viewMode,
    summary: result.stats,
    inputs: {
      left: inputSummary(result.left),
      right: inputSummary(result.right),
    },
    changes: result.entries
      .filter((entry) => entry.type !== 'unchanged')
      .map((entry) => ({
        path: entry.path,
        type: entry.type,
        leftKind: entry.leftKind,
        rightKind: entry.rightKind,
        left: entry.leftPreview,
        right: entry.rightPreview,
      })),
  };
}

/** Serialize a report as pretty-printed JSON. */
export function reportToJson(report: DiffReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Escape pipe characters and newlines so cell content cannot break a table. */
function escapeCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Serialize a report as a Markdown document. */
export function reportToMarkdown(report: DiffReport): string {
  const lines: string[] = [];
  lines.push(`# JSON Diff Report — ${report.tool}`);
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`View mode: ${report.viewMode}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Change | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Added | ${report.summary.added} |`);
  lines.push(`| Removed | ${report.summary.removed} |`);
  lines.push(`| Modified | ${report.summary.modified} |`);
  lines.push(`| Unchanged | ${report.summary.unchanged} |`);
  lines.push(`| Total rows | ${report.summary.total} |`);
  lines.push('');

  const inputIssues: string[] = [];
  if (report.inputs.left.status !== 'valid') {
    inputIssues.push(
      `- Original: ${report.inputs.left.status}${report.inputs.left.error ? ` — ${report.inputs.left.error}` : ''}`
    );
  }
  if (report.inputs.right.status !== 'valid') {
    inputIssues.push(
      `- Modified: ${report.inputs.right.status}${report.inputs.right.error ? ` — ${report.inputs.right.error}` : ''}`
    );
  }
  if (inputIssues.length > 0) {
    lines.push('## Input problems');
    lines.push('');
    lines.push(...inputIssues);
    lines.push('');
  }

  lines.push('## Changes');
  lines.push('');
  if (report.changes.length === 0) {
    lines.push('No differences found.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Change | Path | Original | Modified |');
  lines.push('| --- | --- | --- | --- |');
  for (const change of report.changes) {
    lines.push(
      `| ${CHANGE_LABELS[change.type]} | \`${escapeCell(truncatePath(change.path))}\` | ${escapeCell(change.left) || '—'} | ${escapeCell(change.right) || '—'} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}
