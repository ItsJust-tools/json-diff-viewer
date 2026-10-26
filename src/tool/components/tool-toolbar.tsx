'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiffFilter, DiffReportFormat, DiffViewMode } from '../types';
import { DIFF_FILTERS, DIFF_FILTER_LABELS } from '../types';

interface ToolToolbarProps {
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filter: DiffFilter;
  onFilterChange: (filter: DiffFilter) => void;
  showOnlyChanges: boolean;
  onShowOnlyChangesChange: (value: boolean) => void;
  onFormatBoth: () => void;
  onLoadSample: () => void;
  onClear: () => void;
  onExportReport: (format: DiffReportFormat) => void;
}

function ReportMenu({ onExportReport }: { onExportReport: (format: DiffReportFormat) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="jd-menu" ref={menuRef}>
      <button
        type="button"
        className="jd-btn jd-btn-primary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Download diff report"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⭳</span>
        <span className="jd-btn-label">Report</span>
      </button>
      {open ? (
        <div className="jd-menu-popover" role="menu" aria-label="Report format">
          <button
            type="button"
            role="menuitem"
            className="jd-menu-item"
            onClick={() => {
              setOpen(false);
              onExportReport('json');
            }}
          >
            Download JSON
          </button>
          <button
            type="button"
            role="menuitem"
            className="jd-menu-item"
            onClick={() => {
              setOpen(false);
              onExportReport('markdown');
            }}
          >
            Download Markdown
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ToolToolbar({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  showOnlyChanges,
  onShowOnlyChangesChange,
  onFormatBoth,
  onLoadSample,
  onClear,
  onExportReport,
}: ToolToolbarProps) {
  return (
    <div className="jd-toolbar">
      <div className="jd-segmented" role="group" aria-label="View mode">
        <button
          type="button"
          className={`jd-seg-btn ${viewMode === 'side-by-side' ? 'is-active' : ''}`}
          aria-pressed={viewMode === 'side-by-side'}
          onClick={() => onViewModeChange('side-by-side')}
          title="Side-by-side view (Ctrl+1)"
        >
          Side-by-side
        </button>
        <button
          type="button"
          className={`jd-seg-btn ${viewMode === 'unified' ? 'is-active' : ''}`}
          aria-pressed={viewMode === 'unified'}
          onClick={() => onViewModeChange('unified')}
          title="Unified view (Ctrl+2)"
        >
          Unified
        </button>
      </div>

      <div className="jd-search">
        <label htmlFor="jd-search-input" className="jd-visually-hidden">
          Search paths and values
        </label>
        <input
          id="jd-search-input"
          type="search"
          className="jd-search-input"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search paths or values…"
          aria-label="Search paths and values"
        />
      </div>

      <label className="jd-select-wrap">
        <span className="jd-visually-hidden">Filter by change type</span>
        <select
          className="jd-select"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value as DiffFilter)}
          aria-label="Filter by change type"
        >
          {DIFF_FILTERS.map((value) => (
            <option key={value} value={value}>
              {DIFF_FILTER_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className="jd-check">
        <input
          type="checkbox"
          checked={showOnlyChanges}
          onChange={(event) => onShowOnlyChangesChange(event.target.checked)}
        />
        <span>Only changes</span>
      </label>

      <div className="jd-toolbar-actions">
        <button
          type="button"
          className="jd-btn"
          onClick={onFormatBoth}
          title="Pretty print both inputs (Ctrl+Shift+F)"
          aria-label="Format both JSON inputs"
        >
          <span aria-hidden="true">{'{}'}</span>
          <span className="jd-btn-label">Format</span>
        </button>
        <button
          type="button"
          className="jd-btn"
          onClick={onLoadSample}
          title="Load a sample comparison"
          aria-label="Load sample JSON"
        >
          <span aria-hidden="true">◇</span>
          <span className="jd-btn-label">Sample</span>
        </button>
        <button
          type="button"
          className="jd-btn jd-btn-danger"
          onClick={onClear}
          title="Clear both inputs and reset filters"
          aria-label="Clear both JSON inputs"
        >
          <span aria-hidden="true">⌫</span>
          <span className="jd-btn-label">Clear</span>
        </button>
        <ReportMenu onExportReport={onExportReport} />
      </div>
    </div>
  );
}

ToolToolbar.displayName = 'ToolToolbar';
