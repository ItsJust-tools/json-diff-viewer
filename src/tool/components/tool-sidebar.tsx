'use client';

import type { DiffResult } from '../lib/json-diff';
import { truncatePath } from '../lib/json-diff';
import type { DiffFilter } from '../types';

interface ToolSidebarProps {
  diff: DiffResult;
  filter: DiffFilter;
  onFilterChange: (filter: DiffFilter) => void;
  showOnlyChanges: boolean;
  onShowOnlyChangesChange: (value: boolean) => void;
  wrapLines: boolean;
  onWrapLinesChange: (value: boolean) => void;
  editorsVisible: boolean;
  onEditorsVisibleChange: (value: boolean) => void;
  onFormatBoth: () => void;
}

/** Paths of the removed keys, useful as a quick checklist. */
function removedPaths(diff: DiffResult): string[] {
  return diff.entries.filter((entry) => entry.type === 'removed').map((entry) => entry.path);
}

function InputStatus({ label, parsed }: { label: string; parsed: DiffResult['left'] }) {
  const statusText =
    parsed.status === 'valid' ? 'Valid JSON' : parsed.status === 'empty' ? 'Empty' : 'Invalid JSON';
  return (
    <div className="jd-status-row">
      <dt>{label}</dt>
      <dd>
        <span className={`jd-status-dot jd-status-${parsed.status}`} aria-hidden="true" />
        {statusText}
      </dd>
    </div>
  );
}

export function ToolSidebar({
  diff,
  filter,
  onFilterChange,
  showOnlyChanges,
  onShowOnlyChangesChange,
  wrapLines,
  onWrapLinesChange,
  editorsVisible,
  onEditorsVisibleChange,
  onFormatBoth,
}: ToolSidebarProps) {
  const { stats } = diff;
  const changes = stats.added + stats.removed + stats.modified;
  const identical = diff.comparable && changes === 0;
  const removed = removedPaths(diff);

  return (
    <div className="jd-sidebar">
      <section className="jd-side-section" aria-labelledby="jd-summary-heading">
        <h3 id="jd-summary-heading">Summary</h3>
        <dl className="jd-stats">
          <div className="jd-stat">
            <dt>Added</dt>
            <dd className="jd-stat-added">{stats.added.toLocaleString()}</dd>
          </div>
          <div className="jd-stat">
            <dt>Removed</dt>
            <dd className="jd-stat-removed">{stats.removed.toLocaleString()}</dd>
          </div>
          <div className="jd-stat">
            <dt>Modified</dt>
            <dd className="jd-stat-modified">{stats.modified.toLocaleString()}</dd>
          </div>
          <div className="jd-stat">
            <dt>Unchanged</dt>
            <dd>{stats.unchanged.toLocaleString()}</dd>
          </div>
          <div className="jd-stat">
            <dt>Rows</dt>
            <dd>{stats.total.toLocaleString()}</dd>
          </div>
        </dl>
        {identical ? (
          <p className="jd-identical-note">Both documents are structurally identical.</p>
        ) : null}
      </section>

      <section className="jd-side-section" aria-labelledby="jd-inputs-heading">
        <h3 id="jd-inputs-heading">Inputs</h3>
        <dl className="jd-stats">
          <InputStatus label="Original" parsed={diff.left} />
          <InputStatus label="Modified" parsed={diff.right} />
        </dl>
      </section>

      <section className="jd-side-section" aria-labelledby="jd-filter-heading">
        <h3 id="jd-filter-heading">Filter changes</h3>
        <div className="jd-chip-row" role="group" aria-label="Quick change filters">
          {(['all', 'added', 'removed', 'modified'] as DiffFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`jd-chip jd-chip-${value} ${filter === value ? 'is-active' : ''}`}
              aria-pressed={filter === value}
              onClick={() => onFilterChange(value)}
            >
              {value === 'all' ? 'All' : value[0]?.toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="jd-side-section" aria-labelledby="jd-display-heading">
        <h3 id="jd-display-heading">Display</h3>
        <label className="jd-switch">
          <input
            type="checkbox"
            checked={showOnlyChanges}
            onChange={(event) => onShowOnlyChangesChange(event.target.checked)}
          />
          <span>Only changed paths</span>
        </label>
        <label className="jd-switch">
          <input
            type="checkbox"
            checked={wrapLines}
            onChange={(event) => onWrapLinesChange(event.target.checked)}
          />
          <span>Wrap long values</span>
        </label>
        <label className="jd-switch">
          <input
            type="checkbox"
            checked={editorsVisible}
            onChange={(event) => onEditorsVisibleChange(event.target.checked)}
          />
          <span>Show JSON editors</span>
        </label>
      </section>

      {removed.length > 0 ? (
        <section className="jd-side-section" aria-labelledby="jd-removed-heading">
          <h3 id="jd-removed-heading">Removed keys</h3>
          <ul className="jd-path-list">
            {removed.map((path) => (
              <li key={path}>
                <code>{truncatePath(path)}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="jd-side-section" aria-labelledby="jd-actions-heading">
        <h3 id="jd-actions-heading">Actions</h3>
        <div className="jd-side-actions">
          <button type="button" className="jd-btn jd-btn-block" onClick={onFormatBoth}>
            Pretty print both
          </button>
        </div>
      </section>
    </div>
  );
}

ToolSidebar.displayName = 'ToolSidebar';
