Keep reader data in the JSON data block. This block is a direct child of the widget. The class from `customElement.extend` records data events before Svelte mounts the component. Check the current block before each write. Pass temporary values to the component as props without attribute reflection.

A change to `shared` makes the widget wait for new data. The observer updates the view when the DOM changes. The custom element removes the observer and the listeners when it disconnects.

```js
this.onDataChange = event => {
  if(event.target !== this.dataBlock) return
  this.__wwQuizReadyBlock = event.target
  this.__wwQuizError = ""
  this.refresh()
}
```

The complete widget is in [06-collaboration.svelte](./06-collaboration.svelte). The document sample is in [quiz.html](./quiz.html). The browser test is in [quiz-tests.js](./quiz-tests.js).

The build bundles Svelte and creates `dist/ww-quiz.js` and `dist/ww-hello.js`.
