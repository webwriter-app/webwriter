Keep WebWriter metadata and the reset action on the generated custom-element class. The Vue component owns the view and temporary choice state.

~~~js
const options = {
  answer: {
    type: "select",
    label: {_: "Correct answer"},
    options: [
      {value: "true", label: {_: "True"}},
      {value: "false", label: {_: "False"}},
    ],
  },
}
const actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

class WwQuiz extends VueQuizElement {
  static observedAttributes = ["answer", "contenteditable"]
  static options = options
  static actions = actions

  get answer() { return this.getAttribute("answer") ?? "false" }
  set answer(value) { this.setAttribute("answer", value) }
  resetAnswer() { this.setAttribute("answer", "false") }
}
~~~

The answer accessor stays on the native host. It is not declared as a Vue prop, so Vue does not install a conflicting property descriptor.
