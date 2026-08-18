# AGENTS.md

## Purpose

This project is a browser-native, collaborative DOM editor. The live HTML DOM is the document state. Preserve that model when making changes.

## Decision order

Before adding code, work through these questions in order:

1. Does this need to exist?
   - If no, skip it.
2. Does equivalent code already exist in this codebase?
   - Reuse or extend it; do not create a competing implementation.
3. Can the web platform, HTML, CSS, or JavaScript already do it?
   - Use the platform feature.
4. Can an installed dependency already do it?
   - Use the dependency.
5. Only then, implement the minimum that works.

“Minimum” means the smallest complete change that preserves the invariants below, not the least robust implementation.

Do not introduce a dependency until the platform and installed dependencies have been ruled out.

## Task delegation

- Sol orchestrates the work and delegates simple, scoped tasks to Luna when they can be completed without reading the whole application for context.
- Delegate rote tasks, especially making commits, to Codex 5.3 Spark.

## Architectural invariants

### The HTML DOM is the document state

- Treat the current document structure as authoritative.
- Edit the DOM directly. Do not introduce another editor-owned document model or require the DOM to conform to one.
- `SharedDOMDoc` mirrors the DOM for collaboration; it does not make a normalized schema the source of truth.
- Preserve unfamiliar but valid elements, custom elements, attributes, namespaces, comments, and nesting.
- Avoid rebuilding or normalizing unrelated document structure as a side effect of a command.
- Prefer native DOM, Selection, Range, editing, custom-element, and CSS APIs.

### Keep editing artifacts out of the authored DOM

The authored light DOM must contain document content, not editor UI.

- Put menus, toolbars, overlays, handles, carets, measurement elements, and other editor-owned elements in the body’s shadow root—the **shadow appendix**.
- Access it through `DOMEditor.appendix` or `DOMEditor.addAppendix`.
- Keep the appendix’s default `<slot>` so authored body content remains rendered.
- The only editor artifacts permitted in the authored DOM are temporary marker classes whose names begin with `◆`.
- Do not add editor-only wrapper elements, text nodes, `data-*` attributes, or inline styles to authored content.
- Every marker must begin with `◆`, must not carry document meaning, and must be removed when its state ends, including cancellation, failure, and destruction.
- Marker classes must remain excluded from collaboration and serialization.
- Do not copy an existing light-DOM editing artifact as precedent. When touching one, migrate it to the shadow appendix when that is safely within scope.

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

- `src/domeditor.ts`: editor orchestration, serialization, bridge communication, and the shadow appendix.
- `src/domdoc.ts`: DOM ↔ Yjs reconciliation, collaboration, relative selections, and undo.
- `src/features/`: focused editing capabilities. New document-editing behavior normally belongs in an existing feature.
- `src/components/`: Lit-based editor UI and shadow-DOM components.
- `src/utility.ts`: shared DOM and selection primitives.
- `src/editor-bridge.ts`: messages and events crossing the editor boundary.
- `src/editor.css`: styles for document markers and editor presentation.

Keep responsibilities in these existing layers. Do not create a new abstraction until the current ones cannot reasonably accommodate the behavior.

## Implementation guidance

- Prefer a focused extension of an existing feature over a new feature.
- Feature listeners belong in `activeListeners` or `passiveListeners` so lifecycle cleanup remains automatic.
- Register externally invoked commands through the existing feature `actions` pattern.
- Use the existing selection utilities before writing another Selection or Range abstraction.
- Let normal DOM observation synchronize ordinary edits. Use explicit synchronization or captured changes only when their semantics are required.
- Pair setup with teardown for listeners, observers, markers, styles, and appendix elements.
- Preserve the local TypeScript style and avoid unrelated formatting or refactoring.

## Testing

Add or update the nearest `*.test.ts` file for behavior changes.

Tests should cover the DOM shapes the command claims to support, including irregular but valid structures. When relevant, also cover:

- custom elements or widgets;
- disconnected or concurrently replaced selection endpoints;
- remote collaboration changes;
- undo and redo;
- cleanup of `◆` markers;
- exclusion of editing artifacts from shared and serialized HTML.

Run a focused test while developing:

```sh
npx vitest run src/path/to/relevant.test.ts
```

Before handing off a substantial change, run:

```sh
npx vitest run
```

`npm test` starts watch mode and is not the final one-shot verification command.

## Development safety

The development server is intentionally loopback-only and has no authentication. Never expose it to a network.

Do not commit `.webwriter-dev/`, `.env.local`, API keys, provider credentials, or other local development data.
