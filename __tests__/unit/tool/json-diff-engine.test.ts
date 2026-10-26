import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  diffJsonText,
  filterEntries,
  formatPath,
  parseJsonDocument,
  previewValue,
  summarize,
  truncatePath,
  MAX_PATH_DISPLAY_LENGTH,
  type DiffEntry,
} from '@/tool/lib/json-diff';

const LEFT = JSON.stringify({
  name: 'checkout',
  version: 2,
  retired: true,
  config: { host: 'db.internal', port: 5432 },
  tags: ['a', 'b'],
});

const RIGHT = JSON.stringify({
  name: 'checkout',
  version: 3,
  config: { host: 'db.internal', port: 5433, ssl: true },
  tags: ['a', 'b', 'c'],
  added: { nested: true },
});

function entries(text = LEFT, other = RIGHT): DiffEntry[] {
  return diffJsonText(text, other).entries;
}

function find(rows: DiffEntry[], path: string): DiffEntry | undefined {
  return rows.find((row) => row.path === path);
}

describe('parseJsonDocument', () => {
  it('treats whitespace-only input as empty', () => {
    const parsed = parseJsonDocument('   \n\t ');
    expect(parsed.status).toBe('empty');
    expect(parsed.error).toBeNull();
  });

  it('parses valid JSON of every scalar kind', () => {
    expect(parseJsonDocument('null').status).toBe('valid');
    expect(parseJsonDocument('42').status).toBe('valid');
    expect(parseJsonDocument('"text"').status).toBe('valid');
    expect(parseJsonDocument('true').status).toBe('valid');
    expect(parseJsonDocument('[1,2]').status).toBe('valid');
  });

  it('reports line and column for malformed JSON', () => {
    const parsed = parseJsonDocument('{\n  "a": 1,\n  "b": }\n');
    expect(parsed.status).toBe('invalid');
    expect(parsed.error).toContain('line');
    expect(parsed.line).toBeGreaterThanOrEqual(2);
    expect(parsed.column).toBeGreaterThan(0);
  });

  it('reports an error without a position when one is unavailable', () => {
    const parsed = parseJsonDocument('{"a": 1} trailing');
    expect(parsed.status).toBe('invalid');
    expect(parsed.error).toBeTruthy();
  });
});

describe('formatPath', () => {
  it('uses dot notation for identifiers and brackets for indices', () => {
    expect(formatPath([])).toBe('$');
    expect(formatPath(['user', 'name'])).toBe('$.user.name');
    expect(formatPath(['tags', 0])).toBe('$.tags[0]');
  });

  it('quotes keys that are not valid identifiers', () => {
    expect(formatPath(['odd key'])).toBe('$["odd key"]');
    expect(formatPath(['a-b'])).toBe('$["a-b"]');
  });
});

describe('deepEqual', () => {
  it('ignores object key order', () => {
    expect(deepEqual({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
  });

  it('detects length and type differences', () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual('1', 1)).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe('diffJsonText — added keys', () => {
  it('identifies a newly added top-level key', () => {
    const rows = entries();
    const added = find(rows, '$.added');
    expect(added).toBeDefined();
    expect(added?.type).toBe('added');
    expect(added?.leftKind).toBe('missing');
    expect(added?.rightKind).toBe('object');
    expect(added?.leftPreview).toBe('');
  });

  it('identifies a nested added key without exploding the parent', () => {
    const rows = entries();
    const nested = find(rows, '$.config.ssl');
    expect(nested?.type).toBe('added');
    expect(find(rows, '$.config')?.type ?? 'added').not.toBe('modified');
  });

  it('counts additions in the summary', () => {
    const { stats } = diffJsonText(LEFT, RIGHT);
    // $.config.ssl, $.tags[2], $.added
    expect(stats.added).toBe(3);
  });
});

describe('diffJsonText — removed keys', () => {
  it('identifies a removed top-level key', () => {
    const rows = entries();
    const removed = find(rows, '$.retired');
    expect(removed?.type).toBe('removed');
    expect(removed?.leftKind).toBe('boolean');
    expect(removed?.rightKind).toBe('missing');
    expect(removed?.rightPreview).toBe('');
  });

  it('identifies removed object keys and counts them', () => {
    const { stats, entries: rows } = diffJsonText(LEFT, RIGHT);
    expect(rows.filter((row) => row.type === 'removed').map((row) => row.path)).toEqual([
      '$.retired',
    ]);
    expect(stats.removed).toBe(1);
  });
});

describe('diffJsonText — modified values', () => {
  it('marks a changed primitive as modified', () => {
    const row = find(entries(), '$.version');
    expect(row).toBeDefined();
    expect(row?.type).toBe('modified');
    expect(row?.leftPreview).toBe('2');
    expect(row?.rightPreview).toBe('3');
    expect(row?.leftKind).toBe('number');
    expect(row?.rightKind).toBe('number');
  });

  it('marks a change of type as modified rather than add/remove', () => {
    const rows = entries('{"a": 1}', '{"a": "1"}');
    const row = find(rows, '$.a');
    expect(row?.type).toBe('modified');
    expect(row?.leftKind).toBe('number');
    expect(row?.rightKind).toBe('string');
  });

  it('reports unchanged rows for identical scalars', () => {
    const row = find(entries(), '$.name');
    expect(row?.type).toBe('unchanged');
    expect(row?.leftPreview).toBe('"checkout"');
  });
});

describe('diffJsonText — nested structure', () => {
  it('recurses into nested objects and arrays', () => {
    const rows = entries();
    const port = find(rows, '$.config.port');
    expect(port?.type).toBe('modified');
    expect(port?.depth).toBe(2);
    expect(port?.containerPath).toBe('$.config');
    expect(find(rows, '$.tags[2]')?.type).toBe('added');
  });

  it('preserves left key order and appends new keys', () => {
    const rows = entries('{"b": 1, "a": 2}', '{"a": 3, "c": 4}');
    expect(rows.map((row) => row.path)).toEqual(['$.b', '$.a', '$.c']);
  });

  it('handles arrays of different lengths in both directions', () => {
    const rows = entries('[1,2,3]', '[1]');
    expect(rows.map((row) => `${row.path}:${row.type}`)).toEqual([
      '$[0]:unchanged',
      '$[1]:removed',
      '$[2]:removed',
    ]);
  });

  it('treats a container replaced by a scalar as one modified row', () => {
    const rows = entries('{"cfg":{"a":1}}', '{"cfg":"flat"}');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe('$.cfg');
    expect(rows[0]?.type).toBe('modified');
  });

  it('reports empty containers as unchanged rows', () => {
    const rows = entries('{"list":[],"obj":{}}', '{"list":[],"obj":{}}');
    expect(rows.map((row) => row.path)).toEqual(['$.list', '$.obj']);
    expect(rows.every((row) => row.type === 'unchanged')).toBe(true);
  });

  it('emits a single root row for scalar documents', () => {
    const rows = entries('1', '2');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe('$');
    expect(rows[0]?.type).toBe('modified');
  });

  it('escapes non-identifier keys in nested paths', () => {
    const rows = entries('{"weird key":{"x":1}}', '{"weird key":{"x":2}}');
    expect(rows[0]?.path).toBe('$["weird key"].x');
  });
});

describe('diffJsonText — guard rails', () => {
  it('does not compare when either side is empty', () => {
    const result = diffJsonText('', '{"a":1}');
    expect(result.comparable).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.left.status).toBe('empty');
    expect(result.right.status).toBe('valid');
  });

  it('does not compare when either side is invalid', () => {
    const result = diffJsonText('{"a":}', '{"a":1}');
    expect(result.comparable).toBe(false);
    expect(result.stats.total).toBe(0);
    expect(result.left.status).toBe('invalid');
  });
});

describe('summarize', () => {
  it('counts each change type and the total', () => {
    const rows = entries();
    const stats = summarize(rows);
    expect(stats.total).toBe(rows.length);
    expect(stats.added + stats.removed + stats.modified + stats.unchanged).toBe(rows.length);
  });

  it('returns zeros for no rows', () => {
    expect(summarize([])).toEqual({
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0,
      total: 0,
    });
  });
});

describe('previewValue', () => {
  it('renders empty string for missing values', () => {
    expect(previewValue(undefined)).toBe('');
  });

  it('renders JSON literals and abbreviates long strings', () => {
    expect(previewValue(null)).toBe('null');
    expect(previewValue(false)).toBe('false');
    expect(previewValue('hi')).toBe('"hi"');
    const long = previewValue('x'.repeat(400));
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('…')).toBe(true);
  });

  it('renders containers as single-line JSON', () => {
    expect(previewValue({ a: 1 })).toBe('{"a":1}');
    expect(previewValue([1, 2])).toBe('[1,2]');
  });
});

describe('filterEntries', () => {
  it('filters by change type', () => {
    const rows = entries();
    const onlyAdded = filterEntries(rows, { filter: 'added' });
    expect(onlyAdded.length).toBeGreaterThan(0);
    expect(onlyAdded.every((row) => row.type === 'added')).toBe(true);
  });

  it('drops unchanged rows when only-changes is on', () => {
    const rows = entries();
    const changed = filterEntries(rows, { showOnlyChanges: true });
    expect(changed.some((row) => row.type === 'unchanged')).toBe(false);
  });

  it('searches paths and both previews case-insensitively', () => {
    const rows = entries();
    expect(
      filterEntries(rows, { query: 'CONFIG' }).every((row) => row.path.includes('config'))
    ).toBe(true);
    expect(filterEntries(rows, { query: '5433' }).map((row) => row.path)).toContain(
      '$.config.port'
    );
    expect(filterEntries(rows, { query: 'db.internal' }).length).toBeGreaterThan(0);
  });

  it('returns every row with no options', () => {
    const rows = entries();
    expect(filterEntries(rows)).toHaveLength(rows.length);
  });

  it('combines query and change filter', () => {
    const rows = entries();
    const result = filterEntries(rows, { query: 'tags', filter: 'added' });
    expect(result.map((row) => row.path)).toEqual(['$.tags[2]']);
  });
});

describe('truncatePath', () => {
  it('leaves short paths intact and abbreviates long ones', () => {
    expect(truncatePath('$.a')).toBe('$.a');
    const long = `$.${'x'.repeat(MAX_PATH_DISPLAY_LENGTH + 20)}`;
    const truncated = truncatePath(long);
    expect(truncated.length).toBe(MAX_PATH_DISPLAY_LENGTH);
    expect(truncated.endsWith('…')).toBe(true);
  });
});
