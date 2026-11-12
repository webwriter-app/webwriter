Declare the options and actions on the registered custom-element constructor. The action method changes the `answer` attribute. The option also changes this attribute.

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

The complete registration code is in [05-options.ts](./05-options.ts).
