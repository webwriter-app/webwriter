Use a native slot in the Angular shadow template for the question. The projected nodes remain authored light-DOM content, so editing and collaboration continue to operate on the actual document nodes.

```html
<slot><p>Add a question.</p></slot>
```

The fallback is shown only when the widget has no authored question. The complete source is [03-content.ts](./03-content.ts).
