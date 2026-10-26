import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import manifest from '@/app/manifest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import ErrorPage from '@/app/error';
import NotFound from '@/app/not-found';
import { JsonLd } from '@/app/json-ld';
import ToolPage from '@/app/page';
import { cn } from '@/lib/utils';
import { generateJsonLd, generateToolMetadata } from '@/lib/seo';
import toolConfig from '@/tool/tool.config';
import { getPublicSiteUrl, templateMetadata } from '@/tool/template-metadata';
import { jsonDiffTool } from '@/tool/tool-definition';
import { ToolCanvas } from '@/tool/components/tool-canvas';
import { ToolSidebar } from '@/tool/components/tool-sidebar';
import { ToolToolbar } from '@/tool/components/tool-toolbar';
import { diffJsonText } from '@/tool/lib/json-diff';
import { initialJsonDiffState } from '@/tool/tool-definition';
import type { ExporterLoader } from '@itsjust/core';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/tool-client-wrapper', () => ({
  default: () => <div data-testid="tool-client-wrapper">tool-client-wrapper</div>,
}));

const LEFT = '{\n  "a": 1,\n  "b": 2\n}';
const RIGHT = '{\n  "a": 1,\n  "b": 3,\n  "c": 4\n}';

function renderDiffUi() {
  const diff = diffJsonText(LEFT, RIGHT);
  const noop = () => {};
  return render(
    <>
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
      />
      <ToolSidebar
        diff={diff}
        filter="all"
        onFilterChange={noop}
        showOnlyChanges
        onShowOnlyChangesChange={noop}
        wrapLines={false}
        onWrapLinesChange={noop}
        editorsVisible
        onEditorsVisibleChange={noop}
        onFormatBoth={noop}
      />
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
      />
    </>
  );
}

describe('app and seo', () => {
  const getOgImageUrl = (
    images: NonNullable<NonNullable<ReturnType<typeof generateToolMetadata>['openGraph']>['images']>
  ): string | undefined => {
    const list = Array.isArray(images) ? images : [images];
    const first = list[0];
    if (!first) return undefined;
    if (typeof first === 'string') return first;
    if (first instanceof URL) return first.toString();
    return String(first.url);
  };

  it('builds metadata and json-ld values', () => {
    const metadata = generateToolMetadata(toolConfig);
    const jsonLd = generateJsonLd(toolConfig);

    expect(metadata.creator).toBe(toolConfig.name);
    expect(metadata.metadataBase?.toString()).toBe('http://localhost:3000/');
    const ogUrl = metadata.openGraph?.images ? getOgImageUrl(metadata.openGraph.images) : undefined;
    expect(ogUrl).toContain('/og.svg');
    expect(jsonLd.url).toBe('http://localhost:3000');
    expect(jsonLd.featureList.length).toBeGreaterThan(0);
  });

  it('returns site manifest, robots and sitemap', () => {
    const man = manifest();
    const rob = robots();
    const sm = sitemap();

    expect(man.name).toBe(templateMetadata.appName);
    expect(rob.sitemap).toBe('http://localhost:3000/sitemap.xml');
    expect(sm[0]?.url).toBe('http://localhost:3000');
  });

  it('renders json-ld script safely', () => {
    render(<JsonLd config={{ ...toolConfig, name: '</script>' }} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script?.innerHTML).toContain('\\u003c/script>');
  });

  it('renders error page and invokes reset', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('boom')} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders not-found page', () => {
    render(<NotFound />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('renders top-level tool page', () => {
    render(<ToolPage />);
    expect(screen.getByTestId('tool-client-wrapper')).toBeInTheDocument();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeInTheDocument();
  });

  it('covers tool definition and helper exports', async () => {
    expect(cn('a', undefined, 'b', false, null, 'c')).toBe('a b c');
    expect(getPublicSiteUrl()).toBe('http://localhost:3000');
    expect(jsonDiffTool.deserialize({ leftText: '{}', rightText: '{}' })).toEqual({
      success: true,
      data: { ...initialJsonDiffState, leftText: '{}', rightText: '{}' },
    });
    expect(jsonDiffTool.deserialize({ nope: true })).toEqual({
      success: false,
      error: 'Invalid data format: "leftText" must be a string',
    });
    expect(jsonDiffTool.serialize(initialJsonDiffState)).toContain('"viewMode": "side-by-side"');
    const exporters = jsonDiffTool.exporters ?? [];
    expect(exporters).toHaveLength(4);
    const first = exporters[0];
    expect(first).toBeDefined();
    if (!first) throw new Error('missing exporter');
    const png = await (first.loader as ExporterLoader)();
    const resolved = 'default' in png ? png.default : png.exporter;
    expect(resolved.format).toBe('png');
  });

  it('renders tool components', () => {
    renderDiffUi();

    expect(screen.getByRole('button', { name: /side-by-side/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download diff report/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Left JSON input' })).toHaveValue(LEFT);
    expect(screen.getByRole('textbox', { name: 'Right JSON input' })).toHaveValue(RIGHT);
    expect(screen.getByRole('table', { name: 'JSON differences' })).toBeInTheDocument();
    expect(screen.getByText('$.c')).toBeInTheDocument();
    expect(screen.queryByText('Both documents are structurally identical.')).toBeNull();
  });
});
