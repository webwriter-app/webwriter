Add `answer` and `contenteditable` to `observedAttributes`. Use a React state hook for the reader's choice. The authoring tool can save and share the `answer` HTML attribute. The question stays in the light DOM.

~~~jsx
static observedAttributes = ["answer", "contenteditable"]
get answer() { return this.getAttribute("answer") ?? "false" }

function ReactQuiz({answer, editing}) {
  const [choice, setChoice] = useState("")
  return <button onClick={() => { if(!editing) setChoice("true") }}>True</button>
}
~~~

In edit mode, the widget in `04-state.jsx` hides the answer buttons and shows the text for authors.
