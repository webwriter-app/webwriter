Add answer and contenteditable to observedAttributes, and let a React state hook keep the selected choice. The answer remains an HTML attribute on the custom element, so WebWriter can save and synchronize it. The React view does not own or rewrite the question in the light DOM.

~~~jsx
static observedAttributes = ["answer", "contenteditable"]
get answer() { return this.getAttribute("answer") ?? "false" }

function ReactQuiz({answer, editing}) {
  const [choice, setChoice] = useState("")
  return <button onClick={() => { if(!editing) setChoice("true") }}>True</button>
}
~~~

04-state.jsx also hides the answer buttons while the editor is active and displays the author hint.
