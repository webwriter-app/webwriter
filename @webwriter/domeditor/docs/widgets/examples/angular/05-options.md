Describe editor-facing options and actions as static metadata on the registered custom-element constructor. The action method changes the same `answer` attribute that the option edits.

```ts
class WwQuizElement extends AngularWwQuizElement {
  static options = {
    answer: {
      type: "select",
      label: {_: "Correct answer"},
      options: [
        {value: "true", label: {_: "True"}},
        {value: "false", label: {_: "False"}},
      ],
    },
  }
  static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

  resetAnswer(): void { this.setAttribute("answer", "false") }
}
```

The complete widget registration is in [05-options.ts](./05-options.ts).
