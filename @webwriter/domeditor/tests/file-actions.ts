import type {RibbonDrawer} from "../src/components/ribbon-drawer"

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layout = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

export async function checkFileActions() {
  const heightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight")
  Object.defineProperty(window, "innerHeight", {configurable: true, value: 900})
  const {AppRibbon} = await import("../src/components/ribbon")
  const ribbon = new AppRibbon()
  ribbon.fileName = "Unnamed File"
  ribbon.settings = {...ribbon.settings, disableAI: true}
  ribbon.expanded = true
  ribbon.activeMenu = "Start"
  ribbon.style.width = "900px"
  const fixture = document.querySelector<HTMLElement>("#fixture") ?? document.body
  fixture.append(ribbon)
  try {
    await ribbon.updateComplete
    ribbon.expanded = true
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    const actions = ribbon.shadowRoot!.querySelector<HTMLElement>(".file-quick-actions")!
    const save = actions.querySelector<HTMLElement>(".file-save-action")!
    const share = actions.querySelector<HTMLElement>(".file-share-action")!
    const increase = drawer.querySelector<HTMLElement>('[action="increaseFontSize"]')!
    const decrease = drawer.querySelector<HTMLElement>('[action="decreaseFontSize"]')!
    await Promise.all([save, share, increase, decrease].map(element => (element as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete))
    const rect = (element: Element) => element.getBoundingClientRect()
    const assertControls = (label: string) => {
      const ribbonRect = rect(ribbon), actionsRect = rect(actions)
      const saveRect = rect(save), shareRect = rect(share)
      const increaseRect = rect(increase), decreaseRect = rect(decrease)
      assert(actionsRect.width >= 4.35 * parseFloat(getComputedStyle(ribbon).fontSize) - 1
        && actionsRect.width <= 4.6 * parseFloat(getComputedStyle(ribbon).fontSize) + 1,
      `${label}: quick actions escaped their responsive width: ${actionsRect.width}`)
      assert(actionsRect.left >= ribbonRect.left - 1 && actionsRect.right <= ribbonRect.right + 1,
        `${label}: quick actions overflowed the ribbon: ${JSON.stringify({ribbon:ribbonRect.toJSON(), actions:actionsRect.toJSON()})}`)
      assert(saveRect.width >= 1.5 * parseFloat(getComputedStyle(ribbon).fontSize) - 1
        && shareRect.width >= 1.5 * parseFloat(getComputedStyle(ribbon).fontSize) - 1,
      `${label}: a file action shrank below its usable minimum: ${saveRect.width}, ${shareRect.width}`)
      for(const [first, second] of [[saveRect, shareRect], [increaseRect, decreaseRect]] as const) {
        assert(first.width > 0 && first.height > 0 && second.width > 0 && second.height > 0,
          `${label}: a file or font-size control is not rendered`)
        assert(Math.abs(first.width - second.width) < 1,
          `${label}: paired controls changed size: ${first.width}x${first.height}, ${second.width}x${second.height}`)
      }
      assert(Math.abs(saveRect.width - increaseRect.width) < 1,
        `${label}: file actions no longer match the font-size control size`)
      const iconSize = (element: HTMLElement) => {
        const icon = element.shadowRoot?.querySelector<HTMLElement>(".button-icon")
        return icon ? rect(icon) : null
      }
      const icons = [save, share, increase, decrease].map(iconSize)
      assert(icons.every(icon => icon && icon.width > 0 && icon.height > 0), `${label}: an action icon is missing or hidden`)
      for(const icon of icons.slice(1)) assert(Math.abs(icon!.width - icons[0]!.width) < 1 && Math.abs(icon!.height - icons[0]!.height) < 1,
        `${label}: file and font-control icons changed size`)
      assert(saveRect.right <= shareRect.left + 1, `${label}: file actions overlap`)
      assert(increaseRect.right <= decreaseRect.left + 1, `${label}: font-size controls overlap`)
      return {actionsRect, saveRect, shareRect, increaseRect, decreaseRect, gap: shareRect.left - saveRect.right}
    }

    await Promise.all([save, share, increase, decrease].map(element => (element as HTMLElement & {updateComplete?: Promise<unknown>}).updateComplete))
    await layout()
    const wide = assertControls("wide ribbon")
    assert(Math.abs((wide.saveRect.left + wide.saveRect.right) / 2 - (wide.increaseRect.left + wide.increaseRect.right) / 2) < 1,
      "the first file action lost its font-control alignment")

    ribbon.style.width = "110px"
    await layout()
    const narrow = assertControls("narrow ribbon")
    assert(narrow.gap < wide.gap - 1,
      `quick-action spacing did not shrink under width pressure: ${wide.gap}px to ${narrow.gap}px`)
    assert(decrease.isConnected && increase.isConnected && drawer.getAttribute("layout") === "marks",
      "narrow file actions disturbed the marks controls")
  }
  finally {
    ribbon.remove()
    if(heightDescriptor) Object.defineProperty(window, "innerHeight", heightDescriptor)
    else Reflect.deleteProperty(window, "innerHeight")
  }
}
