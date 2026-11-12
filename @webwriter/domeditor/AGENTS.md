# AGENTS.md

## Purpose

This project is a browser-native, collaborative DOM editor. The live HTML DOM is the document state. Preserve that model when making changes.

Use an up-to-date Node.js 22 release and run `bun install --frozen-lockfile` from the repository root. Run the DOM Editor commands below from `@webwriter/domeditor`.

## Decision order

Before adding code, work through these questions in order:

1. Does this need to exist?
   - If no, skip it.
2. Does equivalent code already exist in this codebase?
   - Reuse or extend it; do not create a competing implementation.
3. Can the web platform, HTML, CSS, or JavaScript already do it?
   - Use the [Modern Web Guidance skill](.agents/skills/modern-web-guidance/SKILL.md) when planning HTML, CSS, or client-side JavaScript changes. Check its guidance for native features, browser support, and fallbacks.
   - Use the platform feature.
4. Can an installed dependency already do it?
   - Use the dependency.
5. Only then, implement the minimum that works.

“Minimum” means the smallest complete change that preserves the invariants below, not the least robust implementation.

Do not introduce a dependency until the platform and installed dependencies have been ruled out.

## Task delegation

- Sol orchestrates the work. Delegate simple, well-scoped tasks that need little context to Luna.
- Delegate complex subtasks to Sol agents only when a very large work package can be split into independent chunks and is best completed in parallel.

## Architectural invariants

### The HTML DOM is the document state

- Treat the current document structure as authoritative.
- Edit the DOM directly. Do not introduce another editor-owned document model or require the DOM to conform to one.
- `SharedDOMDoc` mirrors the DOM for collaboration; it does not make a normalized schema the source of truth.
- Preserve unfamiliar but valid elements, custom elements, attributes, namespaces, comments, and nesting.
- Avoid rebuilding or normalizing unrelated document structure as a side effect of a command.
- Prefer native DOM, Selection, Range, editing, custom-element, and CSS APIs.

### Keep editing artifacts out of the authored DOM

Keep the authored light DOM for document content.

- Put menus, toolbars, overlays, handles, carets, measurement elements, and other editor-owned elements in the body’s shadow root—the **shadow appendix**.
- Access it through `DOMEditor.appendix` or `DOMEditor.addAppendix`.
- Keep the appendix’s default `<slot>` so authored body content remains rendered.
- Keep temporary state such as selection, hover, and drag state in memory. Reuse `src/presentation-state.js` to style authored elements and use parts for appendix controls. Use `:state(ww-…)` in constructed stylesheets registered with `trackPresentationStyles`.
- Keep editor-only classes, attributes, wrappers, text nodes, and inline styles out of authored content. Treat legacy `◆` classes as compatibility input and exclude them from collaboration, history, and saved HTML.
- Installed widgets may receive runtime `contenteditable=""` through `WidgetFeature`. Exclude that runtime value from collaboration, history, and serialization. Preserve explicit authored values such as `contenteditable="false"`.
- Keep frame bootstrap and package resources separate from document content through `src/editor-artifacts.ts`. Preserve authored defaults when temporarily changing native state, such as opening a disclosure for editing.
- Move any existing light-DOM editor UI you touch into the shadow appendix when that is safely within scope.

### Preserve authored element IDs

- Use `src/authored-identities.ts` for persistent IDs on eligible captioned figures, native dialogs and popovers, and SVG editing targets. Preserve existing unique IDs and keep widget internals opaque.
- Assign missing IDs during authoring and import. Resolve collisions on paste before inserting the fragment and update supported references within that fragment.
- Treat assigned IDs as document attributes. Carry them through undo, collaboration, live sessions, and export. Use temporary presentation state for highlighting and other editing affordances.

### Support multi-source editing

The document may be changed by:

- native browser editing;
- editor commands;
- a widget editing itself;
- a widget editing another part of the document;
- direct DOM APIs;
- collaboration or remote updates.

Therefore:

- Inspect the current DOM and selection when a command executes.
- Work with the structure actually present. Do not assume a particular wrapper, parent, sibling count, child order, or provenance.
- Do not assume nodes retained from an earlier event are still connected or unchanged.
- Express command preconditions as DOM queries and relationships. If they are not satisfied, fail safely or make the command a no-op.
- Treat custom elements as atomic from the document editor’s perspective unless their public contract says otherwise.
- Ignore incidental events originating inside widget shadow DOM, while still allowing deliberate widget mutations of the authored DOM to be observed and synchronized.
- Preserve selections where practical, but expect concurrent edits to invalidate selection endpoints.

## Project structure

- `src/domeditor-core.ts` handles editor orchestration, serialization, bridge communication, and the shadow appendix. `src/domeditor.ts` adds authoring features.
- `src/domdoc.ts`: DOM ↔ Yjs reconciliation, collaboration, relative selections, and undo.
- `src/features/`: focused editing capabilities. New document-editing behavior normally belongs in an existing feature.
- `src/components/`: Lit-based editor UI and shadow-DOM components.
- `src/utility.ts`: shared DOM and selection primitives.
- `src/editor-bridge.ts`: messages and events crossing the editor boundary.
- `src/editor.css` and `src/presentation-state.js` provide editor styles and transient presentation state keyed by DOM element.
- `src/authored-identities.ts` assigns persistent element IDs and handles collisions when importing content.

Keep responsibilities in these existing layers. Do not create a new abstraction until the current ones cannot reasonably accommodate the behavior.

## Implementation guidance

- Prefer a focused extension of an existing feature over a new feature.
- Feature listeners belong in `activeListeners` or `passiveListeners` so lifecycle cleanup remains automatic.
- Register externally invoked commands through the existing feature `actions` pattern.
- Use the existing selection utilities before writing another Selection or Range abstraction.
- Let normal DOM observation synchronize ordinary edits. Use explicit synchronization or captured changes only when their semantics are required.
- Pair setup with teardown for listeners, observers, presentation state, styles, and appendix elements. Cover cancellation, failure, and destruction.
- Preserve the local TypeScript style and avoid unrelated formatting or refactoring.

## Testing

Add or update the nearest `*.test.ts` file for behavior changes.

For visual changes, visually confirm the rendered result in a real browser before handoff. Inspect the affected UI at its actual container size and check for overflow, spacing, background colors, typography, and icon sizes against nearby controls. Automated tests alone do not confirm visual quality.

Tests should cover the DOM shapes the command claims to support, including irregular but valid structures. When relevant, also cover:

- custom elements or widgets;
- disconnected or concurrently replaced selection endpoints;
- remote collaboration changes;
- undo and redo;
- cleanup of presentation state, including transitions between selection modes;
- assignment and preservation of authored IDs through paste, import, collaboration, and live sessions;
- filtering of legacy `◆` classes;
- exclusion of editing artifacts from shared and serialized HTML.

Run only focused tests covering the affected behavior by default, during development and before handoff:

```sh
npx vitest run src/path/to/relevant.test.ts
```

Run the full suite only when needed to verify the change (for example, broad changes whose impact cannot be covered by focused tests) or when explicitly requested:

```sh
npx vitest run
```

`npm test` starts watch mode and is not the final one-shot verification command.

## Development safety

The default development server is intentionally loopback-only and has no authentication. Never expose it to a network. The explicit `--private-testing` mode is the sole exception: use it only on a dedicated test host behind a VPN-only reverse proxy, following `dev-server/PRIVATE-TESTING.md`. Node must remain bound to loopback; preserve exact host/origin checks and the separate application/content origins. Never make private testing publicly reachable.

Do not commit `.webwriter-dev/`, `.env.local`, API keys, provider credentials, or other local development data.
