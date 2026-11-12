Use a native slot in the Angular shadow template for the question. The question stays in the light DOM. Authors and collaborators can edit it in the document.

```html
<slot><p>Add a question.</p></slot>
```

The slot displays its default question when the widget has no question. The complete source is [03-content.ts](./03-content.ts).
