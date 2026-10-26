/**
 * Structural JSON diff engine.
 *
 * The engine parses both documents, walks them recursively, and emits a flat
 * list of path-addressed rows. Objects are diffed key-by-key (union of keys,
 * left order first) so added, removed, and modified keys are all identified
 * precisely; arrays are diffed index-by-index and recurse into items when both
 * sides hold a container of the same kind.
 */

/** Change classification for a single diff row. */
export type DiffChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

/** JSON value kinds, plus `missing` for a path absent on one side. */
export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'missing';

/** Ordered path segment: object keys are strings, array positions are numbers. */
export type PathSegment = string | number;

/** One row of the diff. */
export interface DiffEntry {
  /** Stable path string, e.g. `$.user.tags[0]` or `$["odd key"]`. */
  path: string;
  /** Path split into segments for rendering and collapsing. */
  segments: PathSegment[];
  /** Nesting depth; the document root is depth 0. */
  depth: number;
  /** What happened at this path. */
  type: DiffChangeType;
  /** Kind on the original (left) side. */
  leftKind: JsonKind;
  /** Kind on the modified (right) side. */
  rightKind: JsonKind;
  /** Compact, single-line preview of the left value ('' when missing). */
  leftPreview: string;
  /** Compact, single-line preview of the right value ('' when missing). */
  rightPreview: string;
  /** Path of the containing object/array, or null for the root. */
  containerPath: string | null;
}

/** Aggregate counters for the whole comparison. */
export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  total: number;
}

/** Outcome of parsing one input pane. */
export type ParsedJson =
  | { status: 'empty'; value: null; error: null; line: null; column: null }
  | { status: 'valid'; value: unknown; error: null; line: null; column: null }
  | { status: 'invalid'; value: null; error: string; line: number | null; column: number | null };

/** Formatting options for previews. */
const PREVIEW_LIMIT = 120;

/** Longest path string kept verbatim before it is abbreviated for display. */
export const MAX_PATH_DISPLAY_LENGTH = 160;

function kindOf(value: unknown): JsonKind {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'missing';
  }
}

const IDENTIFIER_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Build the canonical path string for a list of segments. */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = '$';
  for (const segment of segments) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else if (IDENTIFIER_SEGMENT.test(segment)) {
      out += `.${segment}`;
    } else {
      out += `[${JSON.stringify(segment)}]`;
    }
  }
  return out;
}

/** Compute 1-based line and column for a character offset. */
function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: clamped - lineStart + 1 };
}

interface SyntaxErrorInfo {
  offset: number;
  message: string;
}

/** Internal carrier for a scanner-detected syntax problem. */
class JsonScanError extends Error {
  readonly offset: number;

  constructor(offset: number, message: string) {
    super(message);
    this.name = 'JsonScanError';
    this.offset = offset;
  }
}

/**
 * Minimal JSON scanner used only to pin down an error offset.
 * `JSON.parse` sometimes reports a message without a position, which makes
 * validation feedback useless in a diff tool; this walk finds the first
 * offending character instead.
 */
function findJsonSyntaxError(text: string): SyntaxErrorInfo | null {
  let index = 0;

  const fail = (message: string): never => {
    throw new JsonScanError(index, message);
  };

  const skipWhitespace = () => {
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code === 32 || code === 9 || code === 10 || code === 13) index += 1;
      else break;
    }
  };

  const parseString = (): void => {
    index += 1; // opening quote
    while (index < text.length) {
      const char = text[index];
      if (char === '"') {
        index += 1;
        return;
      }
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char !== undefined && char.charCodeAt(0) < 0x20) {
        fail('Bad control character in string');
      }
      index += 1;
    }
    fail('Unterminated string');
  };

  const parseNumber = (): void => {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match || match[0].length === 0) {
      fail('Invalid number');
      return;
    }
    index += match[0].length;
  };

  const parseLiteral = (literal: string): void => {
    if (text.slice(index, index + literal.length) !== literal) fail('Invalid literal');
    index += literal.length;
  };

  const parseValue = (): void => {
    skipWhitespace();
    const char = text[index];
    if (char === undefined) fail('Unexpected end of JSON input');
    if (char === '{') return parseObject();
    if (char === '[') return parseArray();
    if (char === '"') return parseString();
    if (char === 't') return parseLiteral('true');
    if (char === 'f') return parseLiteral('false');
    if (char === 'n') return parseLiteral('null');
    if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) return parseNumber();
    return fail(`Unexpected token ${char}`);
  };

  const parseArray = (): void => {
    index += 1;
    skipWhitespace();
    if (text[index] === ']') {
      index += 1;
      return;
    }
    for (;;) {
      parseValue();
      skipWhitespace();
      const char = text[index];
      if (char === ',') {
        index += 1;
        continue;
      }
      if (char === ']') {
        index += 1;
        return;
      }
      fail('Expected , or ]');
    }
  };

  const parseObject = (): void => {
    index += 1;
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    for (;;) {
      skipWhitespace();
      if (text[index] !== '"') fail('Expected double-quoted property name');
      parseString();
      skipWhitespace();
      if (text[index] !== ':') fail("Expected ':' after property name");
      index += 1;
      parseValue();
      skipWhitespace();
      const char = text[index];
      if (char === ',') {
        index += 1;
        continue;
      }
      if (char === '}') {
        index += 1;
        return;
      }
      fail('Expected , or }');
    }
  };

  try {
    parseValue();
    skipWhitespace();
    if (index < text.length) {
      return { offset: index, message: 'Unexpected non-whitespace character after JSON' };
    }
    return null;
  } catch (error) {
    if (error instanceof JsonScanError) {
      return { offset: error.offset, message: error.message };
    }
    return null;
  }
}

/**
 * Parse a JSON document, tolerating empty input and reporting a human-readable
 * error with a line/column when the text is malformed.
 */
export function parseJsonDocument(text: string): ParsedJson {
  if (text.trim() === '') {
    return { status: 'empty', value: null, error: null, line: null, column: null };
  }
  try {
    return {
      status: 'valid',
      value: JSON.parse(text) as unknown,
      error: null,
      line: null,
      column: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';

    // V8 reports positions as either "at position N" or "(line L column C)".
    const lineColumn = /\(line (\d+) column (\d+)\)/i.exec(message);
    if (lineColumn?.[1] !== undefined && lineColumn[2] !== undefined) {
      return {
        status: 'invalid',
        value: null,
        error: message,
        line: Number(lineColumn[1]),
        column: Number(lineColumn[2]),
      };
    }

    const positionMatch = /position\s+(\d+)/i.exec(message);
    const rawOffset = positionMatch?.[1] !== undefined ? Number(positionMatch[1]) : null;
    let offset = rawOffset !== null && Number.isFinite(rawOffset) ? rawOffset : null;
    let reason = message;

    if (offset === null) {
      const located = findJsonSyntaxError(text);
      if (located) {
        offset = located.offset;
        reason = located.message;
      }
    }

    if (offset !== null) {
      const { line, column } = offsetToLineColumn(text, offset);
      return {
        status: 'invalid',
        value: null,
        error: `Invalid JSON: ${reason} (line ${line}, column ${column})`,
        line,
        column,
      };
    }

    return { status: 'invalid', value: null, error: message, line: null, column: null };
  }
}

/** True when both values are deeply equal, ignoring object key order. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const kindA = kindOf(a);
  const kindB = kindOf(b);
  if (kindA !== kindB) return false;
  if (kindA === 'array') {
    const left = a as unknown[];
    const right = b as unknown[];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!deepEqual(left[i], right[i])) return false;
    }
    return true;
  }
  if (kindA === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
      if (!deepEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function abbreviate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

/** Compact single-line preview for a value; `missing` renders as ''. */
export function previewValue(value: unknown): string {
  const kind = kindOf(value);
  if (kind === 'missing') return '';
  if (kind === 'object') {
    const size = Object.keys(value as Record<string, unknown>).length;
    return abbreviate(`${JSON.stringify(value)}`, PREVIEW_LIMIT) || `{${size} keys}`;
  }
  if (kind === 'array') {
    const list = value as unknown[];
    return abbreviate(JSON.stringify(value), PREVIEW_LIMIT) || `[${list.length} items]`;
  }
  if (kind === 'string') return abbreviate(JSON.stringify(value), PREVIEW_LIMIT);
  return abbreviate(String(value), PREVIEW_LIMIT);
}

function makeEntry(params: {
  segments: PathSegment[];
  type: DiffChangeType;
  left: unknown;
  right: unknown;
}): DiffEntry {
  const { segments, type, left, right } = params;
  return {
    path: formatPath(segments),
    segments: [...segments],
    depth: Math.max(0, segments.length),
    type,
    leftKind: kindOf(left),
    rightKind: kindOf(right),
    leftPreview: type === 'added' ? '' : previewValue(left),
    rightPreview: type === 'removed' ? '' : previewValue(right),
    containerPath: segments.length > 0 ? formatPath(segments.slice(0, -1)) : null,
  };
}

function joinKey(segments: readonly PathSegment[], key: string | number): PathSegment[] {
  return [...segments, key];
}

function isEmptyContainer(value: unknown): boolean {
  const kind = kindOf(value);
  if (kind === 'array') return (value as unknown[]).length === 0;
  if (kind === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

/**
 * Recursively compare two values and append rows to `out`.
 *
 * Containers of the same kind are descended into. When only one side is a
 * container the path is reported once as added/removed/modified rather than
 * exploding the whole subtree into rows.
 */
function diffValues(
  left: unknown,
  right: unknown,
  segments: PathSegment[],
  out: DiffEntry[]
): void {
  const leftKind = kindOf(left);
  const rightKind = kindOf(right);

  if (leftKind === 'missing') {
    out.push(makeEntry({ segments, type: 'added', left, right }));
    return;
  }
  if (rightKind === 'missing') {
    out.push(makeEntry({ segments, type: 'removed', left, right }));
    return;
  }

  if (leftKind === 'object' && rightKind === 'object') {
    const leftObj = left as Record<string, unknown>;
    const rightObj = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftObj);
    const rightKeys = Object.keys(rightObj);
    const ordered = [...leftKeys, ...rightKeys.filter((key) => !leftKeys.includes(key))];

    if (ordered.length === 0) {
      out.push(makeEntry({ segments, type: 'unchanged', left, right }));
      return;
    }

    for (const key of ordered) {
      const inLeft = Object.prototype.hasOwnProperty.call(leftObj, key);
      const inRight = Object.prototype.hasOwnProperty.call(rightObj, key);
      const childSegments = joinKey(segments, key);
      if (inLeft && inRight) {
        diffValues(leftObj[key], rightObj[key], childSegments, out);
      } else if (inLeft) {
        out.push(
          makeEntry({
            segments: childSegments,
            type: 'removed',
            left: leftObj[key],
            right: undefined,
          })
        );
      } else {
        out.push(
          makeEntry({
            segments: childSegments,
            type: 'added',
            left: undefined,
            right: rightObj[key],
          })
        );
      }
    }
    return;
  }

  if (leftKind === 'array' && rightKind === 'array') {
    const leftArr = left as unknown[];
    const rightArr = right as unknown[];
    const length = Math.max(leftArr.length, rightArr.length);

    if (length === 0) {
      out.push(makeEntry({ segments, type: 'unchanged', left, right }));
      return;
    }

    for (let index = 0; index < length; index++) {
      const childSegments = joinKey(segments, index);
      const hasLeft = index < leftArr.length;
      const hasRight = index < rightArr.length;
      if (hasLeft && hasRight) {
        diffValues(leftArr[index], rightArr[index], childSegments, out);
      } else if (hasLeft) {
        out.push(
          makeEntry({
            segments: childSegments,
            type: 'removed',
            left: leftArr[index],
            right: undefined,
          })
        );
      } else {
        out.push(
          makeEntry({
            segments: childSegments,
            type: 'added',
            left: undefined,
            right: rightArr[index],
          })
        );
      }
    }
    return;
  }

  if (deepEqual(left, right)) {
    out.push(makeEntry({ segments, type: 'unchanged', left, right }));
    return;
  }

  out.push(makeEntry({ segments, type: 'modified', left, right }));
}

/** Count rows by change type. */
export function summarize(entries: readonly DiffEntry[]): DiffStats {
  const stats: DiffStats = {
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0,
    total: entries.length,
  };
  for (const entry of entries) {
    stats[entry.type] += 1;
  }
  return stats;
}

/** Result of comparing two documents. */
export interface DiffResult {
  left: ParsedJson;
  right: ParsedJson;
  entries: DiffEntry[];
  stats: DiffStats;
  /** True when both panes parsed and the comparison actually ran. */
  comparable: boolean;
}

/**
 * Compare two raw JSON strings.
 *
 * When either pane is empty or invalid no rows are produced and
 * `comparable` is false, so the UI can show a precise validation message
 * instead of a misleading empty diff.
 */
export function diffJsonText(leftText: string, rightText: string): DiffResult {
  const left = parseJsonDocument(leftText);
  const right = parseJsonDocument(rightText);

  if (left.status !== 'valid' || right.status !== 'valid') {
    return {
      left,
      right,
      entries: [],
      stats: summarize([]),
      comparable: false,
    };
  }

  const entries: DiffEntry[] = [];
  diffValues(left.value, right.value, [], entries);
  return { left, right, entries, stats: summarize(entries), comparable: true };
}

function matchesQuery(entry: DiffEntry, query: string): boolean {
  if (!query) return true;
  return (
    entry.path.toLowerCase().includes(query) ||
    entry.leftPreview.toLowerCase().includes(query) ||
    entry.rightPreview.toLowerCase().includes(query)
  );
}

/**
 * Apply the search query, change-type filter, and "only changes" toggle to the
 * raw diff rows. The root row is never filtered out by the change filter alone.
 */
export function filterEntries(
  entries: readonly DiffEntry[],
  options: {
    query?: string;
    filter?: DiffChangeType | 'all';
    showOnlyChanges?: boolean;
  } = {}
): DiffEntry[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const filter = options.filter ?? 'all';
  const showOnlyChanges = options.showOnlyChanges ?? false;

  return entries.filter((entry) => {
    if (showOnlyChanges && entry.type === 'unchanged') return false;
    if (filter !== 'all' && entry.type !== filter) return false;
    return matchesQuery(entry, query);
  });
}

/** Split a path into its rendered segments, keeping array indices as strings. */
export function pathSegmentsToDisplay(segments: readonly PathSegment[]): string[] {
  return segments.map((segment) =>
    typeof segment === 'number' ? `[${segment}]` : String(segment)
  );
}

/** Truncate an over-long path string for a single-line table cell. */
export function truncatePath(path: string): string {
  if (path.length <= MAX_PATH_DISPLAY_LENGTH) return path;
  return `${path.slice(0, MAX_PATH_DISPLAY_LENGTH - 1)}…`;
}

/** Convenience: true when the value is a non-empty object or array. */
export function isContainer(value: unknown): boolean {
  const kind = kindOf(value);
  return (kind === 'object' || kind === 'array') && !isEmptyContainer(value);
}
