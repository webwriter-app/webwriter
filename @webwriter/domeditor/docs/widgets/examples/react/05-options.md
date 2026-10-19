Expose author controls on the element class. WebWriter reads the static options and actions maps, and invokes resetAnswer() for the action. The answer remains an HTML attribute so WebWriter can save and synchronize it.

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

05-options.jsx is the complete self-contained source for the step; the React component uses a state hook for the current choice while the custom-element class exposes the widget contract.
