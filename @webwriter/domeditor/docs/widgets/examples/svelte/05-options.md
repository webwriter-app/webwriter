Svelte’s custom-element prop declaration maps attributes to component props. Use `customElement.extend` to attach WebWriter option and action metadata to the generated custom-element class, and to expose an action method before the inner component mounts.

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

The widget source is [05-options.svelte](./05-options.svelte). The package entry [ww-quiz.js](./ww-quiz.js) imports the final component, whose declared tag self-registers.
