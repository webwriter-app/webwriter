const preview = document.getElementById("preview")

preview.addEventListener("click", async event => {
  const widget = preview.querySelector("ww-ghost-disco")
  const result = preview.querySelector("#conversion-result")
  if(!widget || !result) return
  if(event.target.id === "convert-in") {
    const fragment = document.createDocumentFragment()
    const paragraph = document.createElement("p")
    paragraph.textContent = "Bring a friend to the dance party."
    fragment.append(paragraph)
    widget.loadInvitation(fragment)
    result.textContent = "Converted the paragraph to a widget invitation."
  } else if(event.target.id === "convert-out") {
    result.textContent = widget.toParagraph()?.outerHTML ?? "Add an invitation first."
  } else if(event.target.id === "export-invitation") {
    result.textContent = await widget.exportInvitation().text()
  }
})

preview.addEventListener("change", async event => {
  if(event.target.id !== "import-invitation") return
  const widget = preview.querySelector("ww-ghost-disco")
  const file = event.target.files[0]
  if(!widget || !file) return
  try {
    const apply = await widget.importInvitation(file)
    if(widget.isConnected) apply()
  } catch(error) {
    const result = preview.querySelector("#conversion-result")
    if(result) result.textContent = error.message
  }
})
