import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import ToolClient from '@/app/tool-client';
import ToolClientWrapper from '@/app/tool-client-wrapper';
import { initialJsonDiffState } from '@/tool/tool-definition';
import type { JsonDiffState } from '@/tool/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-tool-client">dynamic-tool-client</div>,
}));

const mockSetData = vi.fn();
const mockToast = vi.fn();
const mockHandleExport = vi.fn();
const mockImport = vi.fn();
const mockToolbarActions = { canUndo: true, canRedo: true, onUndo: vi.fn(), onRedo: vi.fn() };

let toolData: JsonDiffState = { ...initialJsonDiffState };

vi.mock('@itsjust/core', () => ({
  ToolShell: ({ toolbar, sidebar, canvas, statusBar }: Record<string, unknown>) => (
    <div>
      <div>{toolbar as ReactNode}</div>
      <div>{sidebar as ReactNode}</div>
      <div>{canvas as ReactNode}</div>
      <div>{statusBar as ReactNode}</div>
    </div>
  ),
  ImportExport: ({ onShare }: { onShare?: () => void }) => (
    <button type="button" onClick={onShare}>
      trigger-share
    </button>
  ),
  useTool: () => ({
    state: {
      data: toolData,
      setData: mockSetData,
      isDirty: false,
      lastSaved: 'just now',
    },
    toast: mockToast,
    supportedFormats: ['json'],
    handleExport: mockHandleExport,
    importFromFile: mockImport,
    isImporting: false,
    toolbarActions: mockToolbarActions,
  }),
}));

describe('app client', () => {
  beforeEach(() => {
    mockSetData.mockReset();
    mockToast.mockReset();
    toolData = { ...initialJsonDiffState };
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(navigator, 'share', {
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    window.history.replaceState(null, '', 'http://localhost:3000/');
  });

  it('renders dynamic tool client wrapper', () => {
    render(<ToolClientWrapper />);
    expect(screen.getByTestId('dynamic-tool-client')).toBeInTheDocument();
  });

  it('handles the share flow and writes the URL to history', async () => {
    render(<ToolClient />);
    fireEvent.click(screen.getByText('trigger-share'));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(window.location.search).toContain('state=');
    expect(window.location.search).toContain('tool=1793041468');
  });

  it('shows an empty diff hint before any input', () => {
    render(<ToolClient />);
    expect(
      screen.getByText('Paste JSON into one or both editors to start comparing.')
    ).toBeInTheDocument();
  });

  it('updates the view mode through the toolbar', () => {
    render(<ToolClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Unified' }));
    expect(mockSetData).toHaveBeenCalled();
    const updater = mockSetData.mock.calls[0]?.[0] as (prev: JsonDiffState) => JsonDiffState;
    expect(updater(toolData).viewMode).toBe('unified');
  });

  it('loads the sample comparison', () => {
    render(<ToolClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample JSON' }));
    const updater = mockSetData.mock.calls[0]?.[0] as (prev: JsonDiffState) => JsonDiffState;
    const next = updater(toolData);
    expect(next.leftText).toContain('"service": "checkout"');
    expect(next.rightText).toContain('"expressCheckout": true');
    expect(mockToast).toHaveBeenCalledWith('Sample comparison loaded', 'success');
  });

  it('clears both inputs and filters', () => {
    toolData = {
      ...initialJsonDiffState,
      leftText: '{"a":1}',
      rightText: '{"a":2}',
      filter: 'added',
    };
    render(<ToolClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear both JSON inputs' }));
    const updater = mockSetData.mock.calls[0]?.[0] as (prev: JsonDiffState) => JsonDiffState;
    const next = updater(toolData);
    expect(next.leftText).toBe('');
    expect(next.filter).toBe('all');
    expect(mockToast).toHaveBeenCalledWith('Cleared both inputs', 'success');
  });

  it('reports invalid JSON instead of exporting a report', () => {
    toolData = { ...initialJsonDiffState, leftText: '{"a":', rightText: '{}' };
    render(<ToolClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Download diff report' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download JSON' }));
    expect(mockToast).toHaveBeenCalledWith(
      'Original JSON is not valid — fix it before exporting a report',
      'error'
    );
  });

  it('downloads a JSON report when both inputs are valid', () => {
    toolData = { ...initialJsonDiffState, leftText: '{"a":1}', rightText: '{"a":2}' };
    const createObjectURL = vi.fn(() => 'blob:report');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: revokeObjectURL });

    render(<ToolClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Download diff report' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download JSON' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('Report downloaded as json-diff-'),
      'success'
    );
  });

  it('formats both inputs when they are valid', () => {
    toolData = { ...initialJsonDiffState, leftText: '{"a":1}', rightText: '{"b":2}' };
    render(<ToolClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Format both JSON inputs' }));
    const updater = mockSetData.mock.calls[0]?.[0] as (prev: JsonDiffState) => JsonDiffState;
    const next = updater(toolData);
    expect(next.leftText).toBe('{\n  "a": 1\n}');
    expect(next.rightText).toBe('{\n  "b": 2\n}');
    expect(mockToast).toHaveBeenCalledWith('Both inputs formatted', 'success');
  });

  it('loads shared state from the URL when present', async () => {
    const { compressToEncodedURIComponent } = await import('lz-string');
    const encoded = compressToEncodedURIComponent(
      JSON.stringify({ leftText: '{"x":1}', rightText: '{"x":2}' })
    );
    window.history.replaceState(null, '', `http://localhost:3000/?state=${encoded}`);

    render(<ToolClient />);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith('Loaded state from shared URL', 'success')
    );
    const shared = mockSetData.mock.calls[0]?.[0] as JsonDiffState;
    expect(shared.leftText).toBe('{"x":1}');
    expect(shared.rightText).toBe('{"x":2}');
  });
});
