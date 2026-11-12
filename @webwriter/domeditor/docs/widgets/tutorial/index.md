# Build Ghost Disco

Ghost Disco is a widget with a ghost on a dance floor. Authors can edit the invitation and select the lighting. Readers can make the ghost float or twirl. Two participants can share the same move.

<iframe title="Finished Ghost Disco" src="../examples/preview.html?example=ghost-disco&amp;step=6" width="100%" height="360"></iframe>

[Open Ghost Disco in its own page](../examples/preview.html?example=ghost-disco&step=6)

<!-- library:vanilla -->
The widget uses [`HTMLElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement) and runs directly in the browser.
<!-- /library -->
<!-- library:lit -->
The widget uses [Lit templates](https://lit.dev/docs/templates/overview/) and [reactive properties](https://lit.dev/docs/components/properties/). The `LitElementWw` base class supplies the edit state, language changes, and methods for scoped data. The browser runs the JavaScript without a build step.
<!-- /library -->

<!-- library:react -->
The widget uses [JSX](https://react.dev/learn/writing-markup-with-jsx) function components and [React hooks](https://react.dev/reference/react/hooks) inside a custom element. Run the build script to bundle React and React DOM for the browser.
<!-- /library -->
<!-- library:vue -->
The widget uses [Vue single-file components](https://vuejs.org/guide/scaling-up/sfc.html) with [`<script setup>`](https://vuejs.org/api/sfc-script-setup.html), templates, and styles. Run the build scripts before you load the package in WebWriter.
<!-- /library -->
<!-- library:angular -->
The widget uses TypeScript classes with [`@Component`](https://angular.dev/api/core/Component) and [`@Input`](https://angular.dev/api/core/Input) decorators. It uses [Angular templates](https://angular.dev/guide/templates) and [Angular Elements](https://angular.dev/guide/elements). Run the build script before you load the package in WebWriter.
<!-- /library -->
<!-- library:svelte -->
The widget uses [Svelte custom elements](https://svelte.dev/docs/svelte/custom-elements) and [reactive component state](https://svelte.dev/docs/svelte/$state). Run the build script before you load the package in WebWriter.
<!-- /library -->

If this is your first widget, use the [quick start](../introduction/quick-start.md).

| Step | Result |
|---|---|
| [1. Set up the widget](01-setup.md) | A widget that loads in WebWriter. |
| [2. Render the interface](02-rendering.md) | A dance floor, a ghost, and two move buttons. |
| [3. Add editable content](03-content.md) | An invitation authors can edit in the document. |
| [4. Add interactions and state](04-state.md) | Dance controls and a lighting setting in the document. |
| [5. Expose options and actions](05-options.md) | Author controls in the Widget drawer. |
| [6. Support collaboration](06-collaboration.md) | A dance move that participants can share. |
| [7. Test and publish](07-testing-publishing.md) | A test module and a package for publication. |

Each step includes the complete script and a preview. Open [the documentation](../index.md) in a browser to use the interactive previews. If a preview does not open in the page, use its standalone link.
