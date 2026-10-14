# What is a widget?

Widgets are interactive multimedia elements that can be part of a web document. To authors, they are elements that can be inserted and configured. To users, they are parts of the document they are viewing.

From a technical view, a widget is an HTML custom element. Its class extends `HTMLElement`, directly or through a library such as Lit. It can use the web APIs available in the browser.

```html
<ww-quiz answer="false">
  <p>The Moon is a star.</p>
</ww-quiz>
```

The tag name identifies the widget. Attributes hold settings, child nodes hold authored content, and the shadow DOM contains the widget's interface.

A package can provide one or more widgets, plus snippets, styles, and tests. Packaging makes widgets discoverable and loadable in WebWriter.

Next: [widgets and the document](document.md).
