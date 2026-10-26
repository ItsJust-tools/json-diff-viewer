import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCanvas } from '@/tool/components/tool-canvas';
import { ToolSidebar } from '@/tool/components/tool-sidebar';
import { ToolToolbar } from '@/tool/components/tool-toolbar';
import { diffJsonText } from '@/tool/lib/json-diff';
import type { DiffFilter } from '@/tool/types';

const LEFT = JSON.stringify({
  keep: 1,
  drop: 'gone',
  nested: { deep: { value: 1 } },
  list: [1, 2],
});
const RIGHT = JSON.stringify({
  keep: 2,
  nested: { deep: { value: 1 } },
  list: [1, 2, 3],
  fresh: true,
});

const noop = () => {};

function canvas(overrides: Partial<React.ComponentProps<typeof ToolCanvas>> = {}) {
  const diff = diffJsonText(LEFT, RIGHT);
  return (
    <ToolCanvas
      leftText={LEFT}
      rightText={RIGHT}
      viewMode="side-by-side"
      searchQuery=""
      filter="all"
      showOnlyChanges
      editorsVisible
      wrapLines={false}
      diff={diff}
      onLeftTextChange={noop}
      onRightTextChange={noop}
      {...overrides}
    />
  );
}

describe('ToolCanvas', () => {
  it('renders both editors with their text', () => {
    render(canvas());
    expect(screen.getByLabelText('Left JSON input')).toHaveValue(LEFT);
    expect(screen.getByLabelText('Right JSON input')).toHaveValue(RIGHT);
  });

  it('marks valid inputs and shows a row per changed path', () => {
    render(canvas());
    expect(screen.getAllByText('valid')).toHaveLength(2);
    expect(document.querySelector('.jd-row[data-path="$.fresh"]')).not.toBeNull();
    expect(document.querySelector('.jd-row[data-path="$.drop"]')).not.toBeNull();
  });

  it('hides the editors when editorsVisible is false', () => {
    render(canvas({ editorsVisible: false }));
    expect(screen.queryByLabelText('Left JSON input')).toBeNull();
  });

  it('shows an inline error for invalid JSON', () => {
    const diff = diffJsonText('{"a": }', RIGHT);
    render(canvas({ leftText: '{"a": }', diff }));
    const error = document.querySelector('.jd-editor-error');
    expect(error?.textContent).toContain('line');
    expect(screen.getByText('invalid')).toBeInTheDocument();
  });

  it('renders a unified column instead of two value columns', () => {
    render(canvas({ viewMode: 'unified' }));
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Original' })).toBeNull();
  });

  it('applies the change filter to visible rows', () => {
    render(canvas({ filter: 'added' as DiffFilter }));
    const rows = [...document.querySelectorAll<HTMLElement>('.jd-row')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.dataset.change === 'added')).toBe(true);
  });

  it('reports an empty state when the search matches nothing', () => {
    render(canvas({ searchQuery: 'no-such-key' }));
    expect(screen.getByText('No rows match the current search and filter.')).toBeInTheDocument();
  });

  it('explains that no comparison is possible when an input is invalid', () => {
    const diff = diffJsonText('nope', '');
    render(canvas({ leftText: 'nope', rightText: '', diff }));
    expect(
      screen.getByText('Fix the JSON errors above to see the comparison.')
    ).toBeInTheDocument();
  });

  it('propagates editor edits to the change handler', () => {
    const onLeftTextChange = vi.fn();
    render(canvas({ onLeftTextChange }));
    fireEvent.change(screen.getByLabelText('Left JSON input'), { target: { value: '{"x":1}' } });
    expect(onLeftTextChange).toHaveBeenCalledWith('{"x":1}');
  });

  it('indents nested rows by depth', () => {
    render(canvas({ showOnlyChanges: false }));
    const deep = document.querySelector<HTMLElement>('.jd-row[data-path="$.nested.deep.value"]');
    const shallow = document.querySelector<HTMLElement>('.jd-row[data-path="$.keep"]');
    // depth 3 -> (3 - 1) * 14px offset, depth 1 -> no extra offset
    expect(deep?.querySelector<HTMLElement>('.jd-cell-path')?.style.paddingLeft).toContain('28px');
    expect(shallow?.querySelector<HTMLElement>('.jd-cell-path')?.style.paddingLeft).toContain(
      '0px'
    );
  });
});

describe('ToolSidebar', () => {
  function sidebar(overrides: Partial<React.ComponentProps<typeof ToolSidebar>> = {}) {
    return (
      <ToolSidebar
        diff={diffJsonText(LEFT, RIGHT)}
        filter="all"
        onFilterChange={noop}
        showOnlyChanges
        onShowOnlyChangesChange={noop}
        wrapLines={false}
        onWrapLinesChange={noop}
        editorsVisible
        onEditorsVisibleChange={noop}
        onFormatBoth={noop}
        {...overrides}
      />
    );
  }

  it('shows the added, removed, and modified counts', () => {
    const { container } = render(sidebar());
    const value = (label: string) => {
      const terms = [...container.querySelectorAll('dt')];
      const term = terms.find((node) => node.textContent === label);
      return term?.nextElementSibling?.textContent;
    };
    expect(value('Added')).toBe('2');
    expect(value('Removed')).toBe('1');
    expect(value('Modified')).toBe('1');
    expect(value('Rows')).toBe('7');
  });

  it('lists removed keys as a checklist', () => {
    render(sidebar());
    expect(screen.getByRole('heading', { name: 'Removed keys' })).toBeInTheDocument();
    expect(screen.getByText('$.drop')).toBeInTheDocument();
  });

  it('reports identical documents', () => {
    render(sidebar({ diff: diffJsonText('{"a":1}', '{"a":1}') }));
    expect(screen.getByText('Both documents are structurally identical.')).toBeInTheDocument();
  });

  it('calls the change handlers for chips and toggles', () => {
    const onFilterChange = vi.fn();
    const onWrapLinesChange = vi.fn();
    render(sidebar({ onFilterChange, onWrapLinesChange }));
    fireEvent.click(screen.getByRole('button', { name: 'Removed' }));
    expect(onFilterChange).toHaveBeenCalledWith('removed');
    fireEvent.click(screen.getByLabelText('Wrap long values'));
    expect(onWrapLinesChange).toHaveBeenCalledWith(true);
  });

  it('shows input validity per side', () => {
    render(sidebar({ diff: diffJsonText('{', '{}') }));
    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
    expect(screen.getByText('Valid JSON')).toBeInTheDocument();
  });
});

describe('ToolToolbar', () => {
  function toolbar(overrides: Partial<React.ComponentProps<typeof ToolToolbar>> = {}) {
    return (
      <ToolToolbar
        viewMode="side-by-side"
        onViewModeChange={noop}
        searchQuery=""
        onSearchChange={noop}
        filter="all"
        onFilterChange={noop}
        showOnlyChanges
        onShowOnlyChangesChange={noop}
        onFormatBoth={noop}
        onLoadSample={noop}
        onClear={noop}
        onExportReport={noop}
        {...overrides}
      />
    );
  }

  it('reflects the active view mode', () => {
    render(toolbar({ viewMode: 'unified' }));
    expect(screen.getByRole('button', { name: 'Unified' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Side-by-side' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('switches view mode on click', () => {
    const onViewModeChange = vi.fn();
    render(toolbar({ onViewModeChange }));
    fireEvent.click(screen.getByRole('button', { name: 'Unified' }));
    expect(onViewModeChange).toHaveBeenCalledWith('unified');
  });

  it('opens the report menu and dispatches the chosen format', () => {
    const onExportReport = vi.fn();
    render(toolbar({ onExportReport }));
    fireEvent.click(screen.getByRole('button', { name: 'Download diff report' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download Markdown' }));
    expect(onExportReport).toHaveBeenCalledWith('markdown');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the report menu with Escape', () => {
    render(toolbar());
    fireEvent.click(screen.getByRole('button', { name: 'Download diff report' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('filters by change type through the select', () => {
    const onFilterChange = vi.fn();
    render(toolbar({ onFilterChange }));
    fireEvent.change(screen.getByLabelText('Filter by change type'), {
      target: { value: 'modified' },
    });
    expect(onFilterChange).toHaveBeenCalledWith('modified');
  });

  it('toggles only-changes and forwards the search query', () => {
    const onShowOnlyChangesChange = vi.fn();
    const onSearchChange = vi.fn();
    render(toolbar({ onShowOnlyChangesChange, onSearchChange }));
    fireEvent.click(screen.getByLabelText('Only changes'));
    expect(onShowOnlyChangesChange).toHaveBeenCalledWith(false);
    fireEvent.change(screen.getByLabelText('Search paths and values'), {
      target: { value: 'port' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('port');
  });
});
