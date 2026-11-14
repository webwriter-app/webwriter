# Library

Plain JavaScript and Lit can define a widget directly. You can use any library that can define a custom element with the necessary interface. A Web Component adapter can connect a library's user interface to a custom element.

The widget package must supply a [JavaScript module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) that the browser can load. This module must register the custom element.

The library selector controls the examples on other pages. This page shows the final Ghost Disco source for all six libraries. Each version reads dance moves with the same [data helper](../examples/disco/reading.js). The [build step](../tutorial/05-build.md) shows how to package the files.

<!-- library-card:vanilla -->

The [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) language runs in web browsers. JavaScript can use native browser APIs to define and register a custom element. It does not need a UI library.

The Ghost Disco sample defines and registers the widget in one file. It uses browser APIs to create the interface and `@webwriter/widget` to read and write participant data.

**`04-disco-sharing.js`**

<!-- script:../examples/disco/04-disco-sharing.js?library=vanilla -->

<!-- /library-card -->

<!-- library-card:lit -->

The [Lit](https://lit.dev/docs/) library helps you build Web Components. It uses HTML templates to describe a component's interface. Reactive properties update the interface when their values change.

The Ghost Disco sample extends `LitElementWw`. The base class updates the view when the participant data changes.

**`04-disco-sharing.js`**

<!-- script:../examples/disco/lit/04-disco-sharing.js -->

<!-- /library-card -->

<!-- library-card:react -->

[React](https://react.dev/learn) is a library for building user interfaces. A React interface consists of components. Components can use JSX for markup and hooks for state.

The Ghost Disco sample uses `createReactWidget()` from `@webwriter/react` to mount the dance floor inside the widget's shadow root. Its `useWidget(host)` hook follows editing mode and shared participant data.

**`04-disco-sharing.jsx`**

<!-- script:../examples/disco/react/04-disco-sharing.jsx -->

<!-- /library-card -->

<!-- library-card:vue -->

[Vue](https://vuejs.org/guide/extras/web-components.html) is a framework for building user interfaces. Its single-file components can keep templates, code, and styles together. Vue can also define custom elements.

The Ghost Disco sample uses `createVueWidget()` from `@webwriter/vue` in its registration module. The single-file component reads the widget's reactive state with `useWidget()`.

**`04-disco-sharing.vue`**

<!-- script:../examples/disco/vue/04-disco-sharing.vue -->

**`04-disco-sharing.js`**

<!-- script:../examples/disco/vue/04-disco-sharing.js -->

<!-- /library-card -->

<!-- library-card:angular -->

[Angular](https://angular.dev/guide/elements) is a framework for building web applications. It uses TypeScript components and templates to define an interface. Angular Elements can expose an Angular component as a custom element.

The Ghost Disco sample uses `createAngularWidget()` from `@webwriter/angular` to mount its Angular component inside the widget's shadow root. `injectWidget()` gives the component an Angular signal for editing mode and shared participant data.

**`04-disco-sharing.ts`**

<!-- script:../examples/disco/angular/04-disco-sharing.ts -->

<!-- /library-card -->

<!-- library-card:svelte -->

[Svelte](https://svelte.dev/docs/svelte/custom-elements) is a framework for user interfaces. A component file can contain markup, code, and styles. Svelte uses a compiler to turn the component into JavaScript.

The Ghost Disco sample extends Svelte's compiled custom element with `withWidgetRuntime()` from `@webwriter/svelte`. Inside the component, `widgetStore($host())` follows the authored DOM and live-session data.

**`04-disco-sharing.svelte`**

<!-- script:../examples/disco/svelte/04-disco-sharing.svelte -->

<!-- /library-card -->

## Use another Web Component library

Use your library's custom element build or adapter if it supplies one. If the library renders into a DOM container, define an `HTMLElement` that mounts the component in its shadow root. Mount it when the element connects and release its listeners and resources when it disconnects. Register the element under a name with a hyphen, such as `ww-my-widget`. [Custom elements on MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)

Keep document content in the element's light DOM and display it through a slot. Put controls and other interface elements in the shadow DOM. Reflect author settings to HTML attributes and update the interface when those attributes change. Read the element's editing state to decide which controls to show. [Runtime interface](../reference/runtime.md)

Build the source with your library's tools. Export the browser-ready module under `./widgets/ww-my-widget.js` in `package.json` and add the `webwriter-widget` keyword. The module must register the same element name as the export. Bundle the runtime or declare its dependencies so the authoring tool can load them. Check that the built module also runs on a plain HTML page. [Package manifest](../reference/distribution.md) · [Manage dependencies](../guides/libraries.md)

Use the [quick start](quick-start.md) to load your first widget. Use the [Ghost Disco tutorial](../tutorial/index.md) to make a complete widget.

## Widget runtime for React, Vue, Angular, and Svelte

Each adapter exposes `host.widgetRuntime`. Add the authored attributes your view reads to `static widgetAttributes`. Read them in the reactive snapshot's `attributes` map and update them through the host's attributes or reflected properties. The snapshot also includes `editable`, inherited `lang`, and the current `data`, `dataReady`, and `dataError`.

Use `host.widgetRuntime.setData(type, text)` from an interaction to update the widget's inert data block. Wait for `dataReady` before writing live-session data. Declare options and actions on the custom element so WebWriter can use them in its Widget drawer. The adapters export the shared TypeScript declaration types. [Data blocks](../reference/data.md) · [Options and actions](../reference/options-actions.md)
