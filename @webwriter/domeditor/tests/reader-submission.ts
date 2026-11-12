import {connectLiveLearner} from "../src/live-learner"
import {LiveSession} from "../src/live-session"

function assert(condition: unknown, message: string) {
  if(!condition) throw new Error(message)
}

const layout = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

export async function checkReaderSubmission() {
  document.body.innerHTML = `
    <h1>Reader submission</h1>
    <form><div style="height:650px"></div>
      <label>Your name <input name="learner" required></label>
      <test-reader-choice id="quiz" name="choice">
        <script type="application/json" slot="data">{"choice":["one","two"]}</script>
      </test-reader-choice>
    </form>
    <test-reader-local-choice name="local"></test-reader-local-choice>`
  const host = new LiveSession({id: "reader-submission-check", role: "host", baseHTML: ""})
  const learner = new LiveSession({id: host.id, role: "learner"})
  const disconnect = connectLiveLearner(learner, document, {rendered: true})
  try {
    const field = document.querySelector("input")!
    const appendix = document.body.shadowRoot!
    const send = appendix.querySelector<HTMLButtonElement>('[name="submit"]')!
    const print = appendix.querySelector<HTMLButtonElement>('[name="print"]')!
    const confirmation = appendix.querySelector<HTMLElement>(".◆document-submit-confirmation")!
    const [cancel, confirm] = confirmation.querySelectorAll("button")
    let widgetSubmits = 0
    let localSubmits = 0
    customElements.define("test-reader-choice", class extends HTMLElement {
      static formAssociated = true
      internals = this.attachInternals()
      connectedCallback() {
        const choices = new FormData()
        choices.append(this.getAttribute("name")!, "one")
        choices.append(this.getAttribute("name")!, "two")
        this.internals.setFormValue(choices)
        this.addEventListener("submit", () => widgetSubmits++)
      }
    })
    customElements.define("test-reader-local-choice", class extends HTMLElement {
      static formAssociated = true
      constructor() {
        super()
        this.attachInternals().setFormValue("Local answer")
        this.addEventListener("submit", () => localSubmits++)
      }
    })
    await layout()
    assert(send.getBoundingClientRect().left > print.getBoundingClientRect().right, "Submit is not at the right edge of the reader buttons")
    send.click()
    assert(confirmation.hidden && document.activeElement === field && window.scrollY > 0, "the first incomplete response was not revealed")
    field.value = "Ada"
    const quizSnapshot = () => host.states.flatMap(state => state.widgets ?? []).find(widget => widget.id === "quiz")
    const draft = quizSnapshot()?.data?.text
    assert(draft === '{"choice":["one","two"]}', "the host did not already have the draft answer")
    send.click()
    await layout()
    const button = send.getBoundingClientRect(), bubble = confirmation.getBoundingClientRect()
    assert(confirmation.matches(":popover-open") && appendix.activeElement === cancel, "confirmation did not open with focus on Cancel")
    assert(bubble.width > 0 && bubble.left >= 0 && bubble.right <= innerWidth && Math.abs(button.top - bubble.bottom - 8) < 3,
      `the speech bubble did not fit above Submit: ${JSON.stringify({button, bubble, width: innerWidth})}`)
    assert(!document.querySelector("#quiz")!.hasAttribute("submitted"), "opening confirmation marked the widget submitted")
    cancel.click()
    assert(!confirmation.matches(":popover-open") && appendix.activeElement === send, "Cancel did not close the popup and return focus")
    send.click()
    confirm.click()
    await layout()
    assert(quizSnapshot()?.html?.includes('submitted=""') && quizSnapshot()?.data?.text === draft,
      "the host did not receive the submission marker with the existing answer")
    assert(host.steps.every(step => step.kind !== "submission"), "the reader sent a separate answer message")
    assert(widgetSubmits === 1 && localSubmits === 1, "the widgets did not receive the connected submission")
    host.stop()
    assert(!send.hidden, "ending the session hid the local Submit action")
    appendix.querySelector<HTMLButtonElement>(".◆live-session-ended button")!.click()
    document.querySelector("#quiz")!.removeAttribute("submitted")
    send.click()
    confirm.click()
    assert(widgetSubmits === 2 && localSubmits === 2 && document.querySelector("#quiz")!.hasAttribute("submitted"),
      "the offline submission did not reach the widgets locally")
  }
  finally { disconnect(); host.destroy(); learner.destroy() }
}
