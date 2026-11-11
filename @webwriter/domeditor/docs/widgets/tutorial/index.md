# Build Ghost Disco

Give a ghost its own dance floor. In this tutorial, the author writes the invitation and chooses the lighting. Readers can make the ghost float or twirl, and two participants can share the same dance floor.

<iframe title="Finished Ghost Disco" src="../examples/preview.html?example=ghost-disco&amp;step=6" width="100%" height="360"></iframe>

[Open Ghost Disco in its own page](../examples/preview.html?example=ghost-disco&step=6)

<!-- library:vanilla -->
It uses `HTMLElement`, so you need no library or build step.
<!-- /library -->
<!-- library:lit -->
It uses Lit's templates and reactive properties with `LitElementWw`, which supplies WebWriter behavior such as edit mode, inherited language updates, and scoped-data hooks. It uses browser JavaScript and no build step.
<!-- /library -->

<!-- library:react -->
It uses JSX function components and React hooks inside a native custom-element wrapper. Build the browser-ready package with the supplied script to bundle React and React DOM.
<!-- /library -->
<!-- library:vue -->
It uses Vue single-file components with `<script setup>`, templates, and styles. Build the browser-ready package with the supplied scripts before loading it into WebWriter.
<!-- /library -->
<!-- library:angular -->
It uses TypeScript classes with `@Component` and `@Input` decorators, Angular templates, and Angular Elements. Build the browser-ready package with the supplied script before loading it into WebWriter.
<!-- /library -->
<!-- library:svelte -->
It uses Svelte custom elements and reactive component state. Build the browser-ready package with the supplied script before loading it into WebWriter.
<!-- /library -->

Start with the [quick start](../introduction/quick-start.md) if you have not loaded a local widget before.

| Step | Result |
|---|---|
| [1. Set up the widget](01-setup.md) | A widget that loads in WebWriter. |
| [2. Render the interface](02-rendering.md) | A dance floor, a ghost, and two move buttons. |
| [3. Add editable content](03-content.md) | An invitation authors can edit in the document. |
| [4. Add interactions and state](04-state.md) | Reader-selected moves and lighting saved with the document. |
| [5. Expose options and actions](05-options.md) | Author controls in the Widget drawer. |
| [6. Support collaboration](06-collaboration.md) | A dance move that can sync across participants. |
| [7. Test and publish](07-testing-publishing.md) | A test module and a distributable widget. |

Each step includes an expandable complete script and an embedded preview. Run `npm start` in `domeditor` and browse [the documentation](../index.md) to follow along. Markdown viewers that disable iframes can use the standalone preview links.
