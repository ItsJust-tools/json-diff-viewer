import type { ToolConfig } from '@itsjust/core';
import packageJson from '../../package.json';

export const templateBaseVersion = packageJson.version;

const toolConfig = {
  id: '1793041468',
  name: 'JSON Diff Viewer',
  description:
    'Compare two JSON documents side-by-side or in a unified view. See added, removed, and modified paths instantly, then export a diff report as JSON or Markdown.',
  version: '1.0.0',
  exportFormats: ['json', 'png', 'jpeg', 'webp', 'pdf'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#06b6d4',
    accentHover: '#0891b2',
    accentSubtle: 'rgba(6, 182, 212, 0.08)',
    brand: 'JSON Diff',
    icon: '\u21C4',
  },
  shortcuts: [
    {
      title: 'JSON Diff Viewer',
      shortcuts: [
        {
          keys: 'Ctrl+1',
          label: 'Side-by-side view',
          description: 'show original and modified values in two columns',
        },
        {
          keys: 'Ctrl+2',
          label: 'Unified view',
          description: 'show additions and removals in a single column',
        },
        {
          keys: 'Ctrl+Shift+F',
          label: 'Format both',
          description: 'pretty print both JSON inputs',
        },
        {
          keys: 'Ctrl+Shift+J',
          label: 'Download JSON report',
          description: 'export the diff report as JSON',
        },
        {
          keys: 'Ctrl+Shift+M',
          label: 'Download Markdown report',
          description: 'export the diff report as Markdown',
        },
      ],
    },
  ],
} satisfies ToolConfig;

export default toolConfig;
