# Library

Plain JavaScript and Lit can define a widget directly. You can use any library that can define a custom element with the necessary interface. A Web Component adapter can connect a library's user interface to a custom element.

The widget package must supply a [JavaScript module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) that the browser can load. This module must register the custom element.

The library selector controls the examples on other pages. This page shows all six library examples.

<!-- library-card:vanilla -->

The [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) language runs in web browsers. JavaScript can use native browser APIs to define and register a custom element. It does not need a UI library.

The Ghost Disco sample defines and registers the widget in one file. It uses browser APIs to create the interface and handle its state.

**`06-disco-collaboration.js`**

<!-- script:../examples/06-disco-collaboration.js?library=vanilla -->

<!-- /library-card -->

<!-- library-card:lit -->

The [Lit](https://lit.dev/docs/) library helps you build Web Components. It uses HTML templates to describe a component's interface. Reactive properties update the interface when their values change.

The Ghost Disco sample extends `LitElementWw`. A reactive property keeps the stage lighting in sync with the widget's lighting attribute.

**`06-disco-collaboration.js`**

<!-- script:../examples/06-disco-collaboration.js?library=lit -->

<!-- /library-card -->

<!-- library-card:react -->

[React](https://react.dev/learn) is a library for building user interfaces. A React interface consists of components. Components can use JSX for markup and hooks for state.

The Ghost Disco sample uses a React component with hooks. A custom element mounts the component in its shadow root.

**`06-disco-collaboration.jsx`**

<!-- script:../examples/06-disco-collaboration.js?library=react -->

<!-- /library-card -->

<!-- library-card:vue -->

[Vue](https://vuejs.org/guide/extras/web-components.html) is a framework for building user interfaces. Its single-file components can keep templates, code, and styles together. Vue can also define custom elements.

The Ghost Disco sample uses a Vue component and a separate registration module. The component provides the interface, and the module defines the custom element.

**`06-disco-collaboration.vue`**

<!-- script:../examples/06-disco-collaboration.js?library=vue -->

**`06-disco-collaboration.js`**

<!-- script:../examples/vue/06-disco-collaboration.js -->

<!-- /library-card -->

<!-- library-card:angular -->

[Angular](https://angular.dev/guide/elements) is a framework for building web applications. It uses TypeScript components and templates to define an interface. Angular Elements can expose an Angular component as a custom element.

The Ghost Disco sample uses an Angular template for the dance controls. The sample calls `createCustomElement()` to adapt the component before registration.

**`06-disco-collaboration.ts`**

<!-- script:../examples/06-disco-collaboration.js?library=angular -->

<!-- /library-card -->

<!-- library-card:svelte -->

[Svelte](https://svelte.dev/docs/svelte/custom-elements) is a framework for user interfaces. A component file can contain markup, code, and styles. Svelte uses a compiler to turn the component into JavaScript.

The Ghost Disco sample keeps its interface, styles, and state in a Svelte component. The project compiles the component as a custom element.

**`06-disco-collaboration.svelte`**

<!-- script:../examples/06-disco-collaboration.js?library=svelte -->

<!-- /library-card -->

Use the [quick start](quick-start.md) to load your first widget. Use the [Ghost Disco tutorial](../tutorial/index.md) to make a complete widget.
