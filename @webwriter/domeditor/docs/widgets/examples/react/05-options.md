Declare the options and actions on the element class. The authoring tool calls `resetAnswer()` when the author selects the reset action. The answer stays in an HTML attribute. The authoring tool can save and share this attribute.

~~~jsx
static options = {answer: {
  type: "select",
  label: {_: "Correct answer"},
  options: [
    {value: "true", label: {_: "True"}},
    {value: "false", label: {_: "False"}},
  ],
}}
static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}
resetAnswer() { this.setAttribute("answer", "false") }
~~~

The complete source is in `05-options.jsx`. The React component uses a state hook for the reader's choice. The custom-element class supplies the widget interface.
