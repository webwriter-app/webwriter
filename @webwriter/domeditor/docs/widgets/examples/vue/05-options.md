Declare the options and the reset action on the custom-element class. The Vue component displays the question and keeps the reader's temporary choice.

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

Keep the `answer` accessor on the host element. This prevents Vue from creating a second accessor for the same property.
