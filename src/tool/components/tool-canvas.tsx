'use client';

import { useMemo } from 'react';
import type { DiffChangeType, DiffEntry, DiffResult, ParsedJson } from '../lib/json-diff';
import { filterEntries, formatPath, truncatePath } from '../lib/json-diff';
import type { DiffFilter, DiffViewMode } from '../types';
import { DIFF_FILTER_LABELS, MAX_JSON_TEXT_LENGTH } from '../types';

/** Maximum rows rendered at once; keeps huge documents responsive. */
export const MAX_RENDERED_ROWS = 800;

interface ToolCanvasProps {
  canvasRef?: React.RefObject<HTMLDivElement | null>;
  leftText: string;
  rightText: string;
  viewMode: DiffViewMode;
  searchQuery: string;
  filter: DiffFilter;
  showOnlyChanges: boolean;
  editorsVisible: boolean;
  wrapLines: boolean;
  diff: DiffResult;
  onLeftTextChange: (text: string) => void;
  onRightTextChange: (text: string) => void;
}

const CHANGE_SIGN: Record<DiffChangeType, string> = {
  added: '+',
  removed: '−',
  modified: '~',
  unchanged: ' ',
};

const CHANGE_LABEL: Record<DiffChangeType, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  unchanged: 'Unchanged',
};

function kindLabel(entry: DiffEntry, side: 'left' | 'right'): string {
  const kind = side === 'left' ? entry.leftKind : entry.rightKind;
  return kind === 'missing' ? 'missing' : kind;
}

function ValidationBadge({ parsed, label }: { parsed: ParsedJson; label: string }) {
  if (parsed.status === 'valid') {
    return (
      <span className="jd-badge jd-badge-valid" title={`${label} JSON is valid`}>
        valid
      </span>
    );
  }
  if (parsed.status === 'empty') {
    return (
      <span className="jd-badge jd-badge-empty" title={`${label} JSON is empty`}>
        empty
      </span>
    );
  }
  return (
    <span className="jd-badge jd-badge-invalid" title={parsed.error ?? 'Invalid JSON'}>
      invalid
    </span>
  );
}

function EditorPane({
  side,
  label,
  text,
  parsed,
  maxLength,
  onChange,
}: {
  side: 'left' | 'right';
  label: string;
  text: string;
  parsed: ParsedJson;
  maxLength: number;
  onChange: (text: string) => void;
}) {
  const id = `jd-editor-${side}`;
  return (
    <div className={`jd-editor jd-editor-${side}`}>
      <div className="jd-editor-head">
        <label htmlFor={id} className="jd-editor-label">
          {label}
          {side === 'left' ? ' (original)' : ' (modified)'}
        </label>
        <ValidationBadge parsed={parsed} label={label} />
        <span className="jd-editor-count">
          {text.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>
      <textarea
        id={id}
        className="jd-editor-textarea"
        value={text}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        aria-label={`${label} JSON input`}
        aria-invalid={parsed.status === 'invalid'}
        placeholder={
          side === 'left'
            ? '{ "example": "paste original JSON" }'
            : '{ "example": "paste modified JSON" }'
        }
      />
      {parsed.status === 'invalid' && parsed.error ? (
        <p className="jd-editor-error" role="alert">
          {parsed.error}
        </p>
      ) : null}
    </div>
  );
}

interface RowViewProps {
  entry: DiffEntry;
  viewMode: DiffViewMode;
  wrapLines: boolean;
}

function DiffRow({ entry, viewMode, wrapLines }: RowViewProps) {
  const valueClass = wrapLines ? 'jd-value jd-value-wrap' : 'jd-value';
  const rowClass = `jd-row jd-row-${entry.type}`;
  const indent = `${(entry.depth - 1) * 14}px`;

  return (
    <div
      className={rowClass}
      role="row"
      data-path={entry.path}
      data-change={entry.type}
      aria-label={`${CHANGE_LABEL[entry.type]} at ${entry.path}`}
    >
      <div
        className="jd-cell jd-cell-path"
        role="cell"
        style={{ paddingLeft: `calc(0.5rem + ${indent})` }}
      >
        <span className="jd-sign" aria-hidden="true">
          {CHANGE_SIGN[entry.type]}
        </span>
        <code className="jd-path" title={entry.path}>
          {truncatePath(entry.path)}
        </code>
        <span
          className="jd-kind"
          title={`${kindLabel(entry, 'left')} → ${kindLabel(entry, 'right')}`}
        >
          {kindLabel(entry, 'left') === kindLabel(entry, 'right')
            ? kindLabel(entry, 'left')
            : `${kindLabel(entry, 'left')}→${kindLabel(entry, 'right')}`}
        </span>
      </div>
      {viewMode === 'side-by-side' ? (
        <>
          <div className="jd-cell jd-cell-left" role="cell" data-label="Original">
            <code className={valueClass}>{entry.leftPreview}</code>
          </div>
          <div className="jd-cell jd-cell-right" role="cell" data-label="Modified">
            <code className={valueClass}>{entry.rightPreview}</code>
          </div>
        </>
      ) : (
        <div className="jd-cell jd-cell-unified" role="cell" data-label="Value">
          <code className={valueClass}>{entry.rightPreview || entry.leftPreview}</code>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  leftParsed,
  rightParsed,
  comparable,
  totalRows,
}: {
  leftParsed: ParsedJson;
  rightParsed: ParsedJson;
  comparable: boolean;
  totalRows: number;
}) {
  const bothEmpty = leftParsed.status === 'empty' && rightParsed.status === 'empty';
  let message: string;
  if (bothEmpty) {
    message = 'Paste JSON into one or both editors to start comparing.';
  } else if (!comparable) {
    message = 'Fix the JSON errors above to see the comparison.';
  } else if (totalRows > 0) {
    message = 'No rows match the current search and filter.';
  } else {
    message = 'Nothing to show.';
  }
  return (
    <div className="jd-empty" role="status">
      <p>{message}</p>
    </div>
  );
}

export function ToolCanvas({
  canvasRef,
  leftText,
  rightText,
  viewMode,
  searchQuery,
  filter,
  showOnlyChanges,
  editorsVisible,
  wrapLines,
  diff,
  onLeftTextChange,
  onRightTextChange,
}: ToolCanvasProps) {
  const visibleRows = useMemo(
    () =>
      filterEntries(diff.entries, {
        query: searchQuery,
        filter,
        showOnlyChanges,
      }),
    [diff.entries, searchQuery, filter, showOnlyChanges]
  );

  const renderedRows = visibleRows.slice(0, MAX_RENDERED_ROWS);
  const hiddenRowCount = visibleRows.length - renderedRows.length;
  const isEmpty = visibleRows.length === 0;

  return (
    <div className="jd-canvas" ref={canvasRef} data-view-mode={viewMode}>
      {editorsVisible ? (
        <section className="jd-editors" aria-label="JSON inputs">
          <EditorPane
            side="left"
            label="Left"
            text={leftText}
            parsed={diff.left}
            maxLength={MAX_JSON_TEXT_LENGTH}
            onChange={onLeftTextChange}
          />
          <EditorPane
            side="right"
            label="Right"
            text={rightText}
            parsed={diff.right}
            maxLength={MAX_JSON_TEXT_LENGTH}
            onChange={onRightTextChange}
          />
        </section>
      ) : null}

      <section className="jd-results" aria-label="Diff results">
        <div className="jd-results-head">
          <span className="jd-results-title">Differences</span>
          <span className="jd-results-meta">
            {visibleRows.length.toLocaleString()} shown
            {filter !== 'all' ? ` · ${DIFF_FILTER_LABELS[filter]}` : ''}
            {searchQuery.trim() ? ` · “${searchQuery.trim()}”` : ''}
          </span>
        </div>

        {isEmpty ? (
          <EmptyState
            leftParsed={diff.left}
            rightParsed={diff.right}
            comparable={diff.comparable}
            totalRows={diff.entries.length}
          />
        ) : (
          <div
            className="jd-table"
            role="table"
            aria-rowcount={visibleRows.length + 1}
            aria-label="JSON differences"
            data-view={viewMode}
          >
            <div className="jd-table-head" role="row">
              <span role="columnheader">Path</span>
              {viewMode === 'side-by-side' ? (
                <>
                  <span role="columnheader">Original</span>
                  <span role="columnheader">Modified</span>
                </>
              ) : (
                <span role="columnheader">Value</span>
              )}
            </div>
            <div className="jd-table-body">
              {renderedRows.map((entry) => (
                <DiffRow key={entry.path} entry={entry} viewMode={viewMode} wrapLines={wrapLines} />
              ))}
              {hiddenRowCount > 0 ? (
                <p className="jd-truncated" role="status">
                  Showing the first {MAX_RENDERED_ROWS.toLocaleString()} of{' '}
                  {visibleRows.length.toLocaleString()} rows. Narrow the search or filter to see the
                  rest.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** Exposed for tests: canonical path of a row. */
export function rowPath(entry: DiffEntry): string {
  return formatPath(entry.segments);
}
