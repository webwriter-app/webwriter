Keep player data in the current direct-child JSON script in the authored DOM. The class installed through `customElement.extend` captures data events before Svelte mounts, checks the current block before each write, and passes temporary display values to the component as unreflected props. Its synchronous `shared` callback invalidates readiness before a new binding reports itself ready. The host's mutation observer refreshes the display after DOM changes; its disconnect callback releases the observer and listeners.

```js
this.onDataChange = event => {
  if(event.target !== this.dataBlock) return
  this.__wwQuizReadyBlock = event.target
  this.__wwQuizError = ""
  this.refresh()
}
```

The full widget is in [06-collaboration.svelte](./06-collaboration.svelte), with sample authored content in [quiz.html](./quiz.html) and a browser test in [quiz-tests.js](./quiz-tests.js). The package build bundles Svelte into `dist/ww-quiz.js` and `dist/ww-hello.js`.
