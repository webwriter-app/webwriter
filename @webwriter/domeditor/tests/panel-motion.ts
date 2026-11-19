import {DomEditorToolbox} from "../src/components/toolbox"
import {AppRibbon} from "../src/components/ribbon"
import {RibbonDrawer} from "../src/components/ribbon-drawer"
import {RibbonButton} from "../src/components/ribbon-button"

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
