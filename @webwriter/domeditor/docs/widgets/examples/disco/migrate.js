document.addEventListener("migrate", event => {
  const widget = event.target
  if(widget.localName !== "ww-ghost-disco" || !widget.hasAttribute("lights")) return
  if(!widget.hasAttribute("lighting")) widget.setAttribute("lighting", widget.getAttribute("lights"))
  widget.removeAttribute("lights")
})
