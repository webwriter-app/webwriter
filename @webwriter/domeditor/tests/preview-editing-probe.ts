window.addEventListener("message", event => {
  if(event.source !== top || event.data?.type !== "probe-preview-editing") return
  const [port] = event.ports
  try {
    const paragraph = document.querySelector("p")!
    const selection = document.getSelection()!
    let blocked, inserted
    if(event.data.command === "place-caret") {
      window.focus()
      document.body.focus()
      selection.collapse(paragraph.firstChild, 4)
    }
    else if(event.data.command === "try-typing") {
      const input = new InputEvent("beforeinput", {bubbles: true, cancelable: true, inputType: "insertText", data: "!"})
      blocked = !paragraph.dispatchEvent(input)
      inserted = document.execCommand("insertText", false, "!")
    }
    port.postMessage({text: paragraph.textContent, designMode: document.designMode, blocked, inserted,
      caret: selection.isCollapsed && selection.anchorNode === paragraph.firstChild ? selection.anchorOffset : -1})
  }
  catch(error) { port.postMessage({error: String(error)}) }
})
