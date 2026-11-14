export function mountLiveExampleFullscreen(example) {
  const button = example.querySelector("[data-live-fullscreen]")
  const doc = example.ownerDocument
  if(!button || !doc.fullscreenEnabled || typeof example.requestFullscreen !== "function") return

  const status = example.querySelector("[data-live-status]")
  const workspace = example.querySelector("[data-live-workspace]")
  const handles = [...workspace.querySelectorAll("[data-live-resize]")]
  const panes = [...workspace.children].filter(element => !element.hasAttribute("data-live-resize"))
  const isFullscreen = () => doc.fullscreenElement === example
  const message = "The example could not switch fullscreen mode."
  const sizeProperty = handle => `--live-${handle.dataset.liveResize}-size`
  const height = element => element.getBoundingClientRect().height

  function sizes() {
    const [source, , markup, , preview] = getComputedStyle(workspace).gridTemplateRows.split(" ").map(parseFloat)
    return [source, markup, preview]
  }

  function updatePanes() {
    const rows = sizes()
    handles.forEach((handle, index) => {
      handle.setAttribute("aria-valuemax", String(Math.round(rows[index * 2] + rows[1])))
      handle.setAttribute("aria-valuenow", String(Math.round(rows[index * 2])))
    })
    panes.forEach((pane, index) => { pane.inert = rows[index] < 1 })
  }

  function resize(index, value) {
    const rows = sizes()
    const available = height(workspace) - handles.reduce((sum, handle) => sum + height(handle), 0)
    rows[index * 2] = Math.min(rows[index * 2] + rows[1], Math.max(0, value))
    handles.forEach((handle, position) => {
      const ratio = rows[position * 2] / available
      workspace.style.setProperty(sizeProperty(handle), `calc((100% - 2 * var(--live-handle-size)) * ${ratio})`)
    })
    updatePanes()
  }

  const observer = new ResizeObserver(() => {
    if(isFullscreen()) updatePanes()
  })

  for(const [index, handle] of handles.entries()) {
    const direction = index === 0 ? 1 : -1
    let drag
    handle.addEventListener("pointerdown", event => {
      if(!isFullscreen() || !event.isPrimary || event.button !== 0) return
      drag = {id: event.pointerId, y: event.clientY, size: sizes()[index * 2]}
      handle.setPointerCapture(event.pointerId)
      event.preventDefault()
    })
    handle.addEventListener("pointermove", event => {
      if(drag?.id !== event.pointerId || !isFullscreen()) return
      resize(index, drag.size + (event.clientY - drag.y) * direction)
    })
    handle.addEventListener("lostpointercapture", () => { drag = undefined })
    handle.addEventListener("keydown", event => {
      if(!isFullscreen()) return
      const rows = sizes()
      const current = rows[index * 2]
      const targets = {Home: 0, End: current + rows[1], ArrowDown: current + 12 * direction, ArrowUp: current - 12 * direction}
      if(!Object.hasOwn(targets, event.key)) return
      event.preventDefault()
      resize(index, targets[event.key])
    })
  }

  function sync() {
    const fullscreen = isFullscreen()
    const label = fullscreen ? "Exit fullscreen" : "View fullscreen"
    button.title = label
    button.setAttribute("aria-label", label)
    for(const handle of handles) {
      handle.tabIndex = fullscreen ? 0 : -1
      if(!fullscreen) workspace.style.removeProperty(sizeProperty(handle))
    }
    if(fullscreen) {
      updatePanes()
      observer.observe(workspace)
    } else {
      observer.disconnect()
      for(const pane of panes) pane.inert = false
    }
    if(status.textContent === message) status.textContent = ""
  }

  button.hidden = false
  example.addEventListener("fullscreenchange", sync)
  button.addEventListener("click", async () => {
    try {
      if(isFullscreen()) await doc.exitFullscreen()
      else await example.requestFullscreen()
    } catch {
      status.textContent = message
    }
  })
}
