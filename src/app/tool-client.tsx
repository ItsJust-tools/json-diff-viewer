'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToolShell, useTool, ImportExport } from '@itsjust/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import {
  MAX_JSON_TEXT_LENGTH,
  SAMPLE_LEFT,
  SAMPLE_RIGHT,
  ToolCanvas,
  ToolSidebar,
  ToolToolbar,
  buildDiffReport,
  diffJsonText,
  downloadTextFile,
  jsonDiffTool,
  reportFilename,
  reportToJson,
  reportToMarkdown,
  templateBaseVersion,
  toolConfig,
  type DiffFilter,
  type DiffReportFormat,
  type DiffViewMode,
  type JsonSide,
} from '@/tool';
import '../tool/components/json-diff-viewer.css';

/** Re-serialize a JSON document with 2-space indentation. */
function prettyPrint(text: string): string {
  const parsed = JSON.parse(text) as unknown;
  return JSON.stringify(parsed, null, 2);
}

export default function ToolClient() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const tool = useTool(jsonDiffTool, canvasRef);
  const data = tool.state.data;
  const setToolData = tool.state.setData;
  const showToast = tool.toast;
  const [isSharing, setIsSharing] = useState(false);
  const hasLoadedSharedState = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth > 768 && toolConfig.features.sidebar
  );

  const diff = useMemo(
    () => diffJsonText(data.leftText, data.rightText),
    [data.leftText, data.rightText]
  );

  useEffect(() => {
    document.title = toolConfig.name;
  }, []);

  /* ------------------------------ state updates ----------------------------- */

  const applyText = useCallback(
    (side: JsonSide, text: string) => {
      if (text.length > MAX_JSON_TEXT_LENGTH) {
        const kept = text.slice(0, MAX_JSON_TEXT_LENGTH);
        showToast(
          `Input truncated to ${MAX_JSON_TEXT_LENGTH.toLocaleString()} characters (${(
            text.length - MAX_JSON_TEXT_LENGTH
          ).toLocaleString()} dropped)`,
          'error'
        );
        setToolData((prev) =>
          side === 'left' ? { ...prev, leftText: kept } : { ...prev, rightText: kept }
        );
        return;
      }
      setToolData((prev) =>
        side === 'left' ? { ...prev, leftText: text } : { ...prev, rightText: text }
      );
    },
    [setToolData, showToast]
  );

  const setLeftText = useCallback((text: string) => applyText('left', text), [applyText]);
  const setRightText = useCallback((text: string) => applyText('right', text), [applyText]);

  const setViewMode = useCallback(
    (viewMode: DiffViewMode) => {
      setToolData((prev) => ({ ...prev, viewMode }));
    },
    [setToolData]
  );

  const setSearchQuery = useCallback(
    (searchQuery: string) => {
      setToolData((prev) => ({ ...prev, searchQuery }));
    },
    [setToolData]
  );

  const setFilter = useCallback(
    (filter: DiffFilter) => {
      setToolData((prev) => ({ ...prev, filter }));
    },
    [setToolData]
  );

  const setShowOnlyChanges = useCallback(
    (showOnlyChanges: boolean) => {
      setToolData((prev) => ({ ...prev, showOnlyChanges }));
    },
    [setToolData]
  );

  const setEditorsVisible = useCallback(
    (editorsVisible: boolean) => {
      setToolData((prev) => ({ ...prev, editorsVisible }));
    },
    [setToolData]
  );

  const setWrapLines = useCallback(
    (wrapLines: boolean) => {
      setToolData((prev) => ({ ...prev, wrapLines }));
    },
    [setToolData]
  );

  /* -------------------------------- actions --------------------------------- */

  const formatBoth = useCallback(() => {
    const problems: string[] = [];
    let nextLeftText = data.leftText;
    let nextRightText = data.rightText;

    for (const side of ['left', 'right'] as const) {
      const text = side === 'left' ? data.leftText : data.rightText;
      if (text.trim() === '') continue;
      try {
        const formatted = prettyPrint(text);
        if (side === 'left') nextLeftText = formatted;
        else nextRightText = formatted;
      } catch {
        problems.push(side === 'left' ? 'Original' : 'Modified');
      }
    }

    if (nextLeftText !== data.leftText || nextRightText !== data.rightText) {
      setToolData((prev) => ({ ...prev, leftText: nextLeftText, rightText: nextRightText }));
    }

    if (problems.length > 0) {
      showToast(`Could not format: ${problems.join(', ')} — fix the JSON errors first`, 'error');
      return;
    }
    if (nextLeftText.trim() === '' && nextRightText.trim() === '') {
      showToast('Nothing to format yet', 'error');
      return;
    }
    showToast('Both inputs formatted', 'success');
  }, [data.leftText, data.rightText, setToolData, showToast]);

  const loadSample = useCallback(() => {
    setToolData((prev) => ({
      ...prev,
      leftText: SAMPLE_LEFT,
      rightText: SAMPLE_RIGHT,
      filter: 'all',
      searchQuery: '',
    }));
    showToast('Sample comparison loaded', 'success');
  }, [setToolData, showToast]);

  const clearAll = useCallback(() => {
    setToolData((prev) => ({
      ...prev,
      leftText: '',
      rightText: '',
      filter: 'all',
      searchQuery: '',
    }));
    showToast('Cleared both inputs', 'success');
  }, [setToolData, showToast]);

  const exportReport = useCallback(
    (format: DiffReportFormat) => {
      if (!diff.comparable) {
        const invalidSide = diff.left.status === 'invalid' ? 'Original' : 'Modified';
        showToast(`${invalidSide} JSON is not valid — fix it before exporting a report`, 'error');
        return;
      }
      const report = buildDiffReport(diff, {
        tool: toolConfig.name,
        version: toolConfig.version,
        viewMode: data.viewMode,
      });
      const content = format === 'json' ? reportToJson(report) : reportToMarkdown(report);
      const filename = reportFilename(format);
      downloadTextFile(filename, content, format === 'json' ? 'application/json' : 'text/markdown');
      showToast(`Report downloaded as ${filename}`, 'success');
    },
    [data.viewMode, diff, showToast]
  );

  /* ------------------------------ shared state ------------------------------ */

  useEffect(() => {
    if (hasLoadedSharedState.current) return;
    hasLoadedSharedState.current = true;
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get('state');
    if (!encodedState) return;
    try {
      const serialized = decompressFromEncodedURIComponent(encodedState);
      if (!serialized) throw new Error('Invalid shared URL');
      const parsed: unknown = JSON.parse(serialized);
      const deserialized = jsonDiffTool.deserialize(parsed);
      if (!deserialized.success) throw new Error(deserialized.error);
      setToolData(deserialized.data);
      showToast('Loaded state from shared URL', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load shared URL';
      showToast(message, 'error');
    }
  }, [setToolData, showToast]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const serialized = jsonDiffTool.serialize(tool.state.data);
      const encodedState = compressToEncodedURIComponent(serialized);
      if (!encodedState) throw new Error('Failed to encode state for URL');
      const url = new URL(window.location.href);
      url.searchParams.set('state', encodedState);
      url.searchParams.set('tool', toolConfig.id);
      window.history.replaceState(null, '', url.toString());

      const shareUrl = url.toString();
      if (navigator.share) {
        try {
          await navigator.share({ title: toolConfig.name, url: shareUrl });
          showToast('Shared URL ready', 'success');
          return;
        } catch (error) {
          const isAbort =
            typeof error === 'object' &&
            error !== null &&
            'name' in error &&
            (error as { name?: unknown }).name === 'AbortError';
          if (isAbort) return;
        }
      }
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Share URL copied to clipboard', 'success');
      } catch {
        let success = false;
        try {
          const textarea = document.createElement('textarea');
          textarea.value = shareUrl;
          textarea.style.position = 'fixed';
          textarea.style.top = '0';
          textarea.style.left = '0';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          success = document.execCommand('copy');
          document.body.removeChild(textarea);
        } catch {
          success = false;
        }
        if (success) {
          showToast('Share URL copied to clipboard', 'success');
        } else {
          throw new Error('Clipboard access denied or not supported');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share URL';
      showToast(message, 'error');
    } finally {
      setIsSharing(false);
    }
  }, [showToast, tool.state.data]);

  /* ------------------------------- shortcuts -------------------------------- */

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (event.key === '1') {
        event.preventDefault();
        setViewMode('side-by-side');
        return;
      }
      if (event.key === '2') {
        event.preventDefault();
        setViewMode('unified');
        return;
      }
      if (!event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === 'f') {
        event.preventDefault();
        formatBoth();
      } else if (key === 'j') {
        event.preventDefault();
        exportReport('json');
      } else if (key === 'm') {
        event.preventDefault();
        exportReport('markdown');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [exportReport, formatBoth, setViewMode]);

  /* -------------------------------- rendering ------------------------------- */

  const toolbarActions = useMemo(() => ({ ...tool.toolbarActions }), [tool.toolbarActions]);

  const toolbarContent = (
    <>
      <ToolToolbar
        viewMode={data.viewMode}
        onViewModeChange={setViewMode}
        searchQuery={data.searchQuery}
        onSearchChange={setSearchQuery}
        filter={data.filter}
        onFilterChange={setFilter}
        showOnlyChanges={data.showOnlyChanges}
        onShowOnlyChangesChange={setShowOnlyChanges}
        onFormatBoth={formatBoth}
        onLoadSample={loadSample}
        onClear={clearAll}
        onExportReport={exportReport}
      />
      <ImportExport
        formats={tool.supportedFormats}
        onExport={tool.handleExport}
        onImport={tool.importFromFile}
        isImporting={tool.isImporting}
        onShare={handleShare}
        isSharing={isSharing}
      />
    </>
  );

  const sidebarContent = (
    <ToolSidebar
      diff={diff}
      filter={data.filter}
      onFilterChange={setFilter}
      showOnlyChanges={data.showOnlyChanges}
      onShowOnlyChangesChange={setShowOnlyChanges}
      wrapLines={data.wrapLines}
      onWrapLinesChange={setWrapLines}
      editorsVisible={data.editorsVisible}
      onEditorsVisibleChange={setEditorsVisible}
      onFormatBoth={formatBoth}
    />
  );

  const canvasContent = (
    <ToolCanvas
      canvasRef={canvasRef}
      leftText={data.leftText}
      rightText={data.rightText}
      viewMode={data.viewMode}
      searchQuery={data.searchQuery}
      filter={data.filter}
      showOnlyChanges={data.showOnlyChanges}
      editorsVisible={data.editorsVisible}
      wrapLines={data.wrapLines}
      diff={diff}
      onLeftTextChange={setLeftText}
      onRightTextChange={setRightText}
    />
  );

  const statusBarContent = (
    <>
      <span
        className={`status-slot status-slot-state ${tool.state.isDirty ? 'status-unsaved' : 'status-saved'}`}
      >
        {tool.state.isDirty ? (
          <>
            <span className="status-saving-dot" />
            Unsaved
          </>
        ) : tool.state.lastSaved ? (
          <>Saved {tool.state.lastSaved}</>
        ) : (
          'Ready'
        )}
      </span>
      <span className="status-slot status-slot-title">
        +{diff.stats.added} / −{diff.stats.removed} / ~{diff.stats.modified}
      </span>
      <span className="status-slot status-slot-tool-version">Tool v{toolConfig.version}</span>
      <span className="status-slot status-slot-template-version">
        Template v{templateBaseVersion}
      </span>
    </>
  );

  return (
    <ToolShell
      config={toolConfig}
      actions={toolbarActions}
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      toolbar={toolbarContent}
      sidebar={sidebarContent}
      canvas={canvasContent}
      statusBar={statusBarContent}
    />
  );
}
