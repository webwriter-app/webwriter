Store the reader's choice in the JSON data block. This block is a direct child of the widget. The custom element records data events on the host element before Angular starts the component. Accept events only from the current block. A change to `shared` makes the widget wait for new data. The observer updates the view.

The host element reads `answer` from the HTML attribute. It uses the default value when the attribute is missing.

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

The TypeScript source is in [06-collaboration.ts](./06-collaboration.ts). The document sample is in [quiz.html](./quiz.html). The browser test is in [quiz-tests.js](./quiz-tests.js).

Run `npm run build` from this directory. The build bundles Angular and creates `dist/ww-quiz.js` and `dist/ww-hello.js`.
