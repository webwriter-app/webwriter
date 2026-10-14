Store the player’s choice in the current direct child JSON data block. The custom-element wrapper records binding events on the host so readiness is available even if Angular has not initialized the component yet. The component accepts events only when they target the current block. A synchronous `shared` attribute callback invalidates readiness before new binding events arrive; the observer then refreshes the view without clearing a newer result. The wrapper also exposes `answer` from its HTML attribute, including the default value.

```ts
get block() {
  return this.host.querySelector(
    ':scope > script[type="application/json"][slot="data"]:not([src])',
  )
}

this.onDataChange = event => {
  if(event.target !== this.block) return
  this.host.__wwQuizReadyBlock = event.target
  this.error = ""
  this.refresh()
}

get answer() { return this.getAttribute("answer") ?? "false" }
set answer(value) {
  if(value === null || value === undefined) this.removeAttribute("answer")
  else this.setAttribute("answer", String(value))
}
```

The full TypeScript implementation is in [06-collaboration.ts](./06-collaboration.ts), the authored sample in [quiz.html](./quiz.html), and the browser test in [quiz-tests.js](./quiz-tests.js). Build the browser package with `npm run build` from this directory; it bundles Angular and emits `dist/ww-quiz.js` and `dist/ww-hello.js`.
