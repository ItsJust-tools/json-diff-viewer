import { describe, it, expect } from 'vitest';
import { createMockToolState } from '@itsjust/core/testing';
import { initialJsonDiffState, jsonDiffTool, normalizeJsonDiffState } from '@/tool/tool-definition';
import { MAX_JSON_TEXT_LENGTH, type JsonDiffState } from '@/tool/types';
import { buildDiffReport, reportToJson, reportToMarkdown } from '@/tool/lib/diff-report';
import { diffJsonText } from '@/tool/lib/json-diff';
import { reportFilename } from '@/tool/lib/download';
import { SAMPLE_LEFT, SAMPLE_RIGHT } from '@/tool/lib/sample';

describe('jsonDiffTool definition', () => {
  it('uses the tool config identity', () => {
    expect(jsonDiffTool.id).toBe('1793041468');
    expect(jsonDiffTool.name).toBe('JSON Diff Viewer');
    expect(jsonDiffTool.config.features.undoRedo).toBe(true);
  });

  it('registers the four canvas exporters', () => {
    const formats = (jsonDiffTool.exporters ?? []).map((exporter) => exporter.format);
    expect(formats).toEqual(['png', 'jpeg', 'webp', 'pdf']);
  });

  it('serializes state as pretty JSON', () => {
    const text = jsonDiffTool.serialize(initialJsonDiffState);
    expect(text).toContain('"viewMode": "side-by-side"');
    expect(JSON.parse(text)).toEqual(initialJsonDiffState);
  });

  it('round-trips through serialize and deserialize', () => {
    const state: JsonDiffState = {
      leftText: '{"a":1}',
      rightText: '{"a":2}',
      viewMode: 'unified',
      searchQuery: 'a',
      filter: 'modified',
      showOnlyChanges: false,
      editorsVisible: false,
      wrapLines: true,
    };
    const result = jsonDiffTool.deserialize(JSON.parse(jsonDiffTool.serialize(state)));
    expect(result).toEqual({ success: true, data: state });
  });
});

describe('normalizeJsonDiffState — defaults', () => {
  it('fills optional fields from the initial state', () => {
    const result = normalizeJsonDiffState({ leftText: '{}', rightText: '{}' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.viewMode).toBe('side-by-side');
    expect(result.data.filter).toBe('all');
    expect(result.data.showOnlyChanges).toBe(true);
    expect(result.data.editorsVisible).toBe(true);
  });

  it('accepts the initial state unchanged', () => {
    expect(normalizeJsonDiffState(initialJsonDiffState)).toEqual({
      success: true,
      data: initialJsonDiffState,
    });
  });
});

describe('normalizeJsonDiffState — rejection', () => {
  const cases: Array<[string, unknown, string]> = [
    ['null', null, 'expected a JSON object'],
    ['array', [], 'expected a JSON object'],
    ['string', 'text', 'expected a JSON object'],
    ['missing leftText', { rightText: '{}' }, '"leftText" must be a string'],
    ['missing rightText', { leftText: '{}' }, '"rightText" must be a string'],
    ['numeric leftText', { leftText: 5, rightText: '{}' }, '"leftText" must be a string'],
    [
      'unknown viewMode',
      { leftText: '{}', rightText: '{}', viewMode: 'split' },
      '"viewMode" must be',
    ],
    [
      'unknown filter',
      { leftText: '{}', rightText: '{}', filter: 'changed' },
      '"filter" is not a known change type',
    ],
    [
      'non-string search',
      { leftText: '{}', rightText: '{}', searchQuery: 3 },
      '"searchQuery" must be a string',
    ],
    [
      'non-boolean toggle',
      { leftText: '{}', rightText: '{}', wrapLines: 'yes' },
      'must be booleans',
    ],
  ];

  for (const [label, payload, expected] of cases) {
    it(`rejects ${label}`, () => {
      const result = normalizeJsonDiffState(payload);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain(expected);
    });
  }
});

describe('normalizeJsonDiffState — normalization', () => {
  it('truncates oversize documents', () => {
    const huge = 'x'.repeat(MAX_JSON_TEXT_LENGTH + 500);
    const result = normalizeJsonDiffState({ leftText: huge, rightText: '' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.leftText.length).toBe(MAX_JSON_TEXT_LENGTH);
  });

  it('keeps only the normalized state keys', () => {
    const result = normalizeJsonDiffState({
      leftText: '{}',
      rightText: '{}',
      unknownField: 'ignored',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(Object.keys(result.data).sort()).toEqual([
      'editorsVisible',
      'filter',
      'leftText',
      'rightText',
      'searchQuery',
      'showOnlyChanges',
      'viewMode',
      'wrapLines',
    ]);
  });
});

describe('state transitions with mock tool state', () => {
  it('tracks editor edits and undo/redo', () => {
    const state = createMockToolState<JsonDiffState>(initialJsonDiffState);
    state.setData((prev) => ({ ...prev, leftText: '{"a":1}' }));
    state.setData((prev) => ({ ...prev, rightText: '{"a":2}' }));
    expect(state.canUndo).toBe(true);

    state.undo();
    expect(state.data.rightText).toBe('');
    state.undo();
    expect(state.data.leftText).toBe('');
    state.redo();
    expect(state.data.leftText).toBe('{"a":1}');
  });

  it('applies search, filter, and display toggles without losing documents', () => {
    let state: JsonDiffState = {
      ...initialJsonDiffState,
      leftText: '{"a":1}',
      rightText: '{"a":2}',
    };
    state = { ...state, searchQuery: 'a', filter: 'modified', wrapLines: true };
    expect(state.searchQuery).toBe('a');
    expect(state.filter).toBe('modified');
    expect(state.wrapLines).toBe(true);
    expect(state.leftText).toBe('{"a":1}');
  });

  it('switches view mode while keeping the documents', () => {
    const state = createMockToolState<JsonDiffState>({
      ...initialJsonDiffState,
      leftText: '{"a":1}',
      rightText: '{"a":2}',
    });
    state.setData((prev) => ({ ...prev, viewMode: 'unified' }));
    expect(state.data.viewMode).toBe('unified');
    expect(state.data.leftText).toBe('{"a":1}');
  });
});

describe('diff reports', () => {
  const result = diffJsonText(SAMPLE_LEFT, SAMPLE_RIGHT);
  const report = buildDiffReport(result, {
    tool: 'JSON Diff Viewer',
    version: '1.0.0',
    viewMode: 'side-by-side',
    generatedAt: '2026-10-26T19:00:00.000Z',
  });

  it('omits unchanged rows from the change list', () => {
    expect(report.changes.length).toBeGreaterThan(0);
    expect(report.changes.every((change) => change.type !== 'unchanged')).toBe(true);
    expect(report.summary.total).toBe(result.entries.length);
  });

  it('records the paths of added, removed, and modified keys', () => {
    const added = report.changes.filter((change) => change.type === 'added').map((c) => c.path);
    const removed = report.changes.filter((change) => change.type === 'removed').map((c) => c.path);
    const modified = report.changes
      .filter((change) => change.type === 'modified')
      .map((c) => c.path);

    expect(added).toContain('$.database.ssl');
    expect(added).toContain('$.features.expressCheckout');
    expect(removed).toContain('$.timeoutMs');
    expect(modified).toContain('$.version');
    expect(modified).toContain('$.database.port');
  });

  it('produces parseable JSON with an input status summary', () => {
    const parsed = JSON.parse(reportToJson(report)) as typeof report;
    expect(parsed.tool).toBe('JSON Diff Viewer');
    expect(parsed.inputs.left.status).toBe('valid');
    expect(reportToJson(report).endsWith('\n')).toBe(true);
  });

  it('produces Markdown with a summary table and change rows', () => {
    const markdown = reportToMarkdown(report);
    expect(markdown).toContain('# JSON Diff Report — JSON Diff Viewer');
    expect(markdown).toContain('| Added |');
    expect(markdown).toContain('| Change | Path | Original | Modified |');
    expect(markdown).toContain('$.database.port');
  });

  it('states when there are no differences', () => {
    const same = diffJsonText('{"a":1}', '{"a":1}');
    const sameReport = buildDiffReport(same, {
      tool: 'JSON Diff Viewer',
      version: '1.0.0',
      viewMode: 'unified',
    });
    expect(sameReport.changes).toEqual([]);
    expect(reportToMarkdown(sameReport)).toContain('No differences found.');
  });

  it('lists input problems in Markdown', () => {
    const broken = diffJsonText('{"a":', '{}');
    const brokenReport = buildDiffReport(broken, {
      tool: 'JSON Diff Viewer',
      version: '1.0.0',
      viewMode: 'unified',
    });
    expect(reportToMarkdown(brokenReport)).toContain('## Input problems');
  });

  it('escapes pipes and newlines inside Markdown cells', () => {
    const tricky = diffJsonText('{"a":"x|y"}', '{"a":"x|z\\nline"}');
    const trickyReport = buildDiffReport(tricky, {
      tool: 'JSON Diff Viewer',
      version: '1.0.0',
      viewMode: 'unified',
    });
    const markdown = reportToMarkdown(trickyReport);
    expect(markdown).toContain('x\\|y');
  });
});

describe('reportFilename', () => {
  it('builds timestamped names per format', () => {
    const now = new Date('2026-10-26T20:06:00.000Z');
    expect(reportFilename('json', now)).toBe('json-diff-2026-10-26T20-06-00.json');
    expect(reportFilename('markdown', now)).toBe('json-diff-2026-10-26T20-06-00.md');
  });
});
