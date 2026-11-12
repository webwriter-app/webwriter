# Library

Widgets are [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components). A widget is an [HTML custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements). Its [runtime interface](../reference/runtime.md) lets the authoring tool use the widget.

Plain JavaScript and Lit can define a custom element directly. You can use any library that can define a custom element with the necessary interface. A Web Component adapter can connect a library's user interface to a custom element.

The widget package must supply a [JavaScript module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) that the browser can load. This module must register the custom element.

The library selector changes the code and previews in the examples. It has six choices (**[JS](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide)**, **[Lit](https://lit.dev/docs/)**, **[React](https://react.dev/learn)**, **[Vue](https://vuejs.org/guide/extras/web-components.html)**, **[Angular](https://angular.dev/guide/elements)**, and **[Svelte](https://svelte.dev/docs/svelte/custom-elements)**). The examples use the same document HTML and public interface for all six choices.

Use the [quick start](quick-start.md) to load your first widget. Use the [Ghost Disco tutorial](../tutorial/index.md) to make a complete widget.
