# JSON Diff Viewer

Compare two JSON documents side-by-side or in a unified view. Every difference is
addressed by its JSON path, so you can see exactly which key was added, removed, or
modified — no diffing raw text and guessing.

**Live:** [json-diff-viewer.itsjust.tools](https://json-diff-viewer.itsjust.tools)

## What it does

- **Side-by-side comparison** — original and modified values in two columns with a
  shared path column.
- **Unified view** — one value column for narrow screens or quick scanning.
- **Path highlighting** — every row is labelled with its canonical path
  (`$.database.pool.max`, `$.regions[2]`, `$["odd key"]`) and indented by depth.
- **Structural diffing** — objects are compared key by key (left key order preserved),
  arrays index by index; nested containers recurse instead of collapsing into one blob.
- **Validation and pretty printing** — both panes report `valid` / `empty` / `invalid`
  with a line and column for syntax errors, and "Format" re-indents valid input.
- **Search and filter** — free-text search across paths and values, plus change-type
  filters (added / removed / modified) and an "only changes" toggle.
- **Report export** — download the diff as JSON or Markdown, or use the shell export
  menu for PNG / JPEG / WebP / PDF snapshots.

Everything runs in the browser. No uploads, no accounts, no server-side processing.

## Diff semantics

| Situation                             | Result                                                            |
| ------------------------------------- | ----------------------------------------------------------------- |
| Key only on the right                 | one `added` row                                                   |
| Key only on the left                  | one `removed` row                                                 |
| Same key, different scalar or type    | one `modified` row (`number → string` is shown in the kind badge) |
| Same key, both objects or both arrays | recurses into children                                            |
| Container replaced by a scalar        | one `modified` row at that path                                   |
| Empty object or array on both sides   | one `unchanged` row                                               |

Documents over 200,000 characters are truncated per pane with a toast, and at most
800 rows are rendered at once; narrow the search or filter to see the remainder.

## Project structure

```text
src/
├── app/
│   └── tool-client.tsx          # state wiring, shortcuts, share, reports
├── tool/
│   ├── tool.config.ts           # metadata, features, shortcuts
│   ├── tool-definition.ts       # state shape, serialize/deserialize, exporters
│   ├── types.ts                 # DiffViewMode, DiffFilter, JsonDiffState
│   ├── components/
│   │   ├── tool-canvas.tsx      # editors + diff table
│   │   ├── tool-toolbar.tsx     # view mode, search, filter, actions, report menu
│   │   ├── tool-sidebar.tsx     # summary, input status, filters, display toggles
│   │   └── json-diff-viewer.css
│   └── lib/
│       ├── json-diff.ts         # parse, validate, recursive diff, filtering
│       ├── diff-report.ts       # JSON / Markdown report builders
│       ├── download.ts          # client-side file download
│       └── sample.ts            # demo documents
└── lib/                         # generic app utilities
```

The shared shell, hooks, and export engines live in `packages/core` (`@itsjust/core`).

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest unit tests
npm run test:e2e   # Playwright
npm run build      # core build + Next.js production build
```

## Keyboard shortcuts

| Keys                | Action                      |
| ------------------- | --------------------------- |
| `Ctrl+1` / `Ctrl+2` | Side-by-side / Unified view |
| `Ctrl+Shift+F`      | Format both inputs          |
| `Ctrl+Shift+J`      | Download JSON report        |
| `Ctrl+Shift+M`      | Download Markdown report    |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo                 |
| `Ctrl+B`            | Toggle sidebar              |
| `Ctrl+?`            | Show all shortcuts          |

## License

MIT
