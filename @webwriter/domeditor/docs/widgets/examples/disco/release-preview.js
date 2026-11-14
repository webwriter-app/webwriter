import {checkLighting} from "#disco-checks"
import "#disco-migrate"

const preview = document.getElementById("preview")
preview.addEventListener("click", async event => {
  const widget = preview.querySelector("ww-ghost-disco")
  const result = preview.querySelector("#release-result")
  if(!widget || !result) return
  if(event.target.id === "migrate-invitation") {
    widget.removeAttribute("lighting")
    widget.setAttribute("lights", "neon")
    widget.dispatchEvent(new CustomEvent("migrate", {bubbles: true, detail: {version: "2.0.0"}}))
    result.textContent = `Lighting: ${widget.getAttribute("lighting")}`
  } else if(event.target.id === "run-lighting-test") {
    const fixture = document.createElement("ww-ghost-disco")
    fixture.setAttribute("lighting", "neon")
    try {
      fixture.hidden = true
      document.body.append(fixture)
      await checkLighting(fixture)
      result.textContent = "Pass: lighting was restored and reset."
    } catch(error) {
      result.textContent = error.message
    } finally {
      fixture.remove()
    }
  }
})
