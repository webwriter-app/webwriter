---
name: webwriter-guidance
description: Search and retrieve WebWriter's widget documentation. Use before answering WebWriter widget questions or implementing changes that rely on its documented widget interfaces, including package exports, framework adapters, editing controls, state, styling, and live sessions.
---

# WebWriter Guidance

Use the WebWriter widget guides, tutorials, and interface reference through the `@webwriter/guidance` CLI. Run it with Node.js 22.20 or newer.

## Search

Search for one capability or API at a time. Use WebWriter terminology and exact identifiers when known.

```sh
npx -y @webwriter/guidance search "widget package exports"
npx -y @webwriter/guidance search "optionschange"
```

In a WebWriter checkout, run `node @webwriter/guidance/cli.mjs` from the repository root in place of `npx -y @webwriter/guidance` to consult the docs on the current branch.

Search and list return JSON arrays of `{id, description}` entries. If the descriptions are weak, try a more specific term or alternate wording, such as `"participant data scopes"` for shared widget state. Use `list` to browse the catalog when search terms are unclear.

## Retrieve

Retrieve the full Markdown for the matching IDs. Pair a task guide with an interface reference when you need exact fields or event behavior.

```sh
npx -y @webwriter/guidance retrieve "guides/live-sessions,reference/options-actions"
```

If the CLI saves long output to a temporary file, read that file in full. Retrieved pages are source Markdown. Select the example for the relevant framework and follow linked docs and example files as needed.

## Apply

Check the answer or implementation against the retrieved pages and cite the relevant documents. When the docs leave behavior unclear, inspect the matching code and tests if the source is available and identify any conclusion based on those sources.
