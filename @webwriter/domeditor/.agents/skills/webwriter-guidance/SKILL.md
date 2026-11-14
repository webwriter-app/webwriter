---
name: webwriter-guidance
description: Search and retrieve WebWriter's widget documentation. Use before answering WebWriter widget questions or implementing changes that rely on its documented widget interfaces, including package exports, framework adapters, editing controls, state, styling, and live sessions.
---

# WebWriter Guidance

Use the widget guides, tutorials, and interface reference in this checkout. Run the bundled CLI with Node.js 22 from `@webwriter/domeditor`. It reads the Markdown directly and works offline.

## Search

Search for one capability or API at a time, using WebWriter terms and exact identifiers when known.

```sh
node .agents/skills/webwriter-guidance/scripts/webwriter-guidance.mjs search "widget package exports"
node .agents/skills/webwriter-guidance/scripts/webwriter-guidance.mjs search "optionschange"
```

Search and list return JSON arrays of `{id, description}` entries. If the descriptions are weak, try a more specific term or alternate wording, such as `"participant data scopes"` for shared widget state. Use `list` to browse the catalog when search terms are unclear.

```sh
node .agents/skills/webwriter-guidance/scripts/webwriter-guidance.mjs list
```

## Retrieve

Retrieve the full Markdown for the matching IDs. Pair a task guide with an interface reference when you need exact fields or event behavior.

```sh
node .agents/skills/webwriter-guidance/scripts/webwriter-guidance.mjs retrieve "guides/live-sessions,reference/options-actions"
```

If the CLI saves long output to a temporary file, read that file in full. Retrieved pages are the source Markdown, so use the example for the relevant framework and follow linked files or include directives for additional code.

## Apply

Check the answer or implementation against the retrieved pages. Cite the relevant page paths. If the docs leave behavior unclear, inspect the matching code and tests in this checkout and identify any conclusion based on those sources.
