Svelte maps the custom element's attributes to component props. Use `customElement.extend` to declare options and actions on the custom-element class. The action method is available before the component mounts.

```js
extend: Base => class extends Base {
  static options = {answer: {type: "select", label: {_: "Correct answer"}, options: [
    {value: "true", label: {_: "True"}},
    {value: "false", label: {_: "False"}},
  ]}}
  static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}
  resetAnswer() { this.setAttribute("answer", "false") }
}
```

The complete source is [05-options.svelte](./05-options.svelte). The package entry module [ww-quiz.js](./ww-quiz.js) imports the component. The component registers its custom element.
