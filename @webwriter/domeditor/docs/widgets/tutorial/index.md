# Build a quiz widget

This tutorial takes you through implementing a small true-or-false quiz.

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
| [2. Render the interface](02-rendering.md) | A question, answer buttons, and feedback area. |
| [3. Add editable content](03-content.md) | An authored question displayed through a slot. |
| [4. Add interactions and state](04-state.md) | Answer checking and a saved correct-answer setting. |
| [5. Expose options and actions](05-options.md) | Author controls in the Widget drawer. |
| [6. Support collaboration](06-collaboration.md) | Answers in a scoped data block. |
| [7. Test and publish](07-testing-publishing.md) | A test module and a distributable widget. |

Each step includes an expandable complete script and an embedded preview. Run `npm start` in `domeditor` and browse [the documentation](../index.md) to follow along. Markdown viewers that disable iframes can use the standalone preview links.
