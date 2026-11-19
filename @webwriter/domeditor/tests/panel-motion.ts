import {DomEditorToolbox} from "../src/components/toolbox"
import {AppRibbon} from "../src/components/ribbon"
import {RibbonDrawer} from "../src/components/ribbon-drawer"
import {RibbonButton} from "../src/components/ribbon-button"
import {DomEditor} from "../src/components/dom-editor"

/** Panels resize the document once, then animate without intermediate layouts. */
export async function checkPanelMotion() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const shell = document.createElement("div")
  shell.style.cssText = "position:fixed;inset:0;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr);background:white"
  const ribbon = new AppRibbon()
  ribbon.style.gridColumn = "1 / -1"
  const toolbox = new DomEditorToolbox()
  toolbox.style.gridColumn = "2"
  toolbox.style.gridRow = "2"
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:100%;height:100%;min-width:0;min-height:0;border:0"
  frame.srcdoc = `<!doctype html><body>${"<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>".repeat(60)}</body>`
  shell.append(ribbon, frame, toolbox)
  document.body.append(shell)
  try {
    await Promise.all([ribbon.updateComplete, toolbox.updateComplete])
    await nextFrame(); await nextFrame(); await nextFrame()
    const sample = async (change: () => void, label: string) => {
      change()
      await Promise.all([ribbon.updateComplete, toolbox.updateComplete])
      const dimensions: string[] = []
      for(let index = 0; index < 16; index++) {
        await nextFrame()
        const bounds = frame.getBoundingClientRect()
        dimensions.push(`${bounds.width},${bounds.height}`)
      }
      assert(new Set(dimensions).size === 1, `${label} resized the document during motion: ${dimensions.join("; ")}`)
    }
    const closedWidth = frame.getBoundingClientRect().width
    await sample(() => { toolbox.activeTool = "Review" }, "Review opening")
    assert(frame.getBoundingClientRect().width < closedWidth, "Review did not reserve its final width")
    const pane = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!
    assert(pane.scrollWidth <= pane.clientWidth, "Review overflows horizontally")
    await sample(() => { toolbox.activeTool = null }, "Review closing")
    assert(frame.getBoundingClientRect().width === closedWidth, "Review did not release its width")
    await sample(() => { ribbon.expanded = false }, "ribbon closing")
    await sample(() => { ribbon.expanded = true }, "ribbon opening")

    const drawer = new RibbonDrawer()
    drawer.collapsed = true
    drawer.style.cssText = "position:fixed;left:100px;top:180px;width:84px;height:90px"
    for(const label of ["Align", "Lists", "Spacing"]) {
      const button = new RibbonButton()
      button.label = label
      drawer.append(button)
    }
    shell.append(drawer)
    await drawer.updateComplete
    await nextFrame(); await nextFrame()
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    for(const open of [true, false]) {
      open ? drawer.openDrawer() : drawer.closeDrawer()
      await drawer.updateComplete
      const height = controls.getBoundingClientRect().height
      for(let index = 0; index < 8; index++) {
        await nextFrame()
        assert(Math.abs(controls.getBoundingClientRect().height - height) < 0.1, "compact drawer resized its controls during motion")
      }
    }
  }
  finally { shell.remove() }
}

/** Exercise the editor's actual bottom-pane CSS against a long document. */
export async function checkBottomPanelMotion() {
  const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:0;top:0;width:1100px;height:700px;background:white"
  const root = host.attachShadow({mode: "open"})
  const styles = document.createElement("style")
  styles.textContent = DomEditor.styles.cssText
  root.append(styles)
  const stage = document.createElement("div")
  stage.className = "document-stage"
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:100%;height:100%;min-width:0;min-height:0;border:0"
  frame.srcdoc = `<!doctype html><body>${"<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>".repeat(60)}</body>`
  stage.append(frame)
  root.append(stage)
  const panels = ["html-source", "document-layouts"].map(name => {
    const panel = document.createElement("div")
    panel.className = `${name}-panel`
    const clip = document.createElement("div")
    clip.className = `${name}-clip`
    const content = document.createElement(name === "html-source" ? "developer-console" : "section")
    if(name === "document-layouts") {
      content.className = "document-layouts-bar"
      content.innerHTML = '<h2>Layouts &amp; Recently opened</h2><p>Document · Canvas · Slides · Board</p>'
    }
    clip.append(content)
    panel.append(clip)
    root.append(panel)
    return {panel, content}
  })
  panels[0].panel.inert = true
  document.body.append(host)
  try {
    const sample = async (panel: HTMLElement, content: HTMLElement, label: string) => {
      const dimensions = new Set<string>()
      const heights = new Set<number>()
      let moved = false
      let previousTop: number | undefined
      for(let index = 0; index < 16; index++) {
        await nextFrame()
        const documentBox = frame.getBoundingClientRect(), contentBox = content.getBoundingClientRect()
        dimensions.add(`${documentBox.width},${documentBox.height}`)
        heights.add(Math.round(contentBox.height * 100) / 100)
        if(previousTop !== undefined && Math.abs(contentBox.top - previousTop) > 0.1) moved = true
        previousTop = contentBox.top
      }
      assert(dimensions.size === 1, `${label} repeatedly resized the document`)
      assert(heights.size === 1, `${label} resized its contents: ${[...heights]}`)
      assert(getComputedStyle(content).visibility === (panel.inert ? "hidden" : "visible"), `${label} left the wrong visibility`)
      if(!panel.inert) assert(getComputedStyle(content).transform === "none", `${label} retained a containing block for fixed popups`)
      return moved
    }
    const layouts = panels[1], source = panels[0]
    // The Layouts pane is shown on initial insertion, before any toggles.
    await sample(layouts.panel, layouts.content, "initial Layouts")
    for(const width of [1100, 480]) {
      host.style.width = `${width}px`
      await nextFrame(); await nextFrame()
      for(const {panel, content} of [layouts, source]) {
        panel.inert = false
        await sample(panel, content, `${width}px opening`)
        const openedHeight = frame.getBoundingClientRect().height
        panel.inert = true
        const moved = await sample(panel, content, `${width}px closing`)
        assert(frame.getBoundingClientRect().height > openedHeight, "closed pane retained document space")
        if(!matchMedia("(prefers-reduced-motion: reduce)").matches) assert(moved, "closing pane did not slide out")
        panel.inert = false
        await nextFrame(); await nextFrame()
        panel.inert = true
        await nextFrame(); await nextFrame()
        panel.inert = false
        await sample(panel, content, `${width}px interrupted close`)
        panel.inert = true
        await sample(panel, content, `${width}px closed`)
      }
    }
    host.style.setProperty("--ww-ui-transition", "none")
    source.panel.inert = false
    await nextFrame()
    assert(getComputedStyle(source.content).visibility === "visible", "disabled motion hid the console")
    source.panel.inert = true
    await nextFrame()
    assert(getComputedStyle(source.content).visibility === "hidden", "disabled motion left the console visible")
    assert(source.content.getAnimations().length === 0, "disabled motion retained an animation")
  }
  finally { host.remove() }
}
