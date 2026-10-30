import {RibbonButton} from "../src/components/ribbon-button"
import {RibbonCombobox} from "../src/components/ribbon-combobox"
import type {StyleMarkOption} from "../src/marks"

declare global {
  interface Window {runPopupAnchorCheck?: (inspect?: boolean) => Promise<void>}
}

const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const layout = async () => {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}
const insideViewport = (rect: DOMRect, width: number, height: number, label: string) => {
  assert(rect.left >= 7 && rect.top >= 7 && rect.right <= width - 7 && rect.bottom <= height - 7,
    `${label} overflowed viewport: ${JSON.stringify(rect.toJSON())} in ${width}x${height}`)
}

window.runPopupAnchorCheck = async (inspect = false) => {
  document.body.replaceChildren()
  document.body.style.cssText = "margin:0;min-height:1800px;font:16px system-ui"
  scrollTo(0, 0)
  const button = new RibbonButton()
  Object.assign(button, {label:"Actions", submenu:["First item", "Second item", "Third item"]})
  Object.assign(button.style, {position:"absolute", left:`${document.documentElement.clientWidth - 156}px`, top:`${innerHeight - 60}px`, width:"148px"})
  document.body.append(button)
  await button.updateComplete; await layout()
  const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
  const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
  trigger.click(); await button.updateComplete; await layout()
  const menu = button.shadowRoot!.querySelector<HTMLElement>("ribbon-menu")!
  assert(menu.matches(":popover-open"), "ribbon menu did not open in the top layer")
  let rowRect = row.getBoundingClientRect(), menuRect = menu.getBoundingClientRect()
  insideViewport(menuRect, document.documentElement.clientWidth, document.documentElement.clientHeight, "ribbon menu")
  assert(menuRect.right >= rowRect.right - 2 && menuRect.left <= rowRect.left + 2, "ribbon menu no longer spans its trigger")
  assert(menuRect.bottom <= rowRect.top + 1, "ribbon menu did not flip above a bottom-edge trigger")
  const menuSurface = menu.shadowRoot!.querySelector<HTMLElement>(".menu")!, menuStyle = getComputedStyle(menuSurface)
  assert(menuStyle.backgroundColor === "rgb(255, 255, 255)" && parseFloat(menuStyle.fontSize) >= 12,
    "ribbon menu lost its readable white surface styling")
  const beforeScroll = {row: rowRect, menu: menuRect}
  scrollTo(0, 30); await layout()
  rowRect = row.getBoundingClientRect(); menuRect = menu.getBoundingClientRect()
  assert(Math.abs((menuRect.top - beforeScroll.menu.top) - (rowRect.top - beforeScroll.row.top)) < 1,
    "open ribbon menu did not follow native document scrolling")
  insideViewport(menuRect, document.documentElement.clientWidth, document.documentElement.clientHeight, "scrolled ribbon menu")
  button.closeSubmenu(); await button.updateComplete

  const options: StyleMarkOption[] = [
    {label:"One", value:"one"}, {label:"Two", value:"two"}, {label:"Three", value:"three"},
    {label:"Four", value:"four"}, {label:"Five", value:"five"}, {label:"Six", value:"six"},
  ]
  const combo = new RibbonCombobox()
  Object.assign(combo, {name:"popup-fixture", label:"Font", options})
  scrollTo(0, 0)
  Object.assign(combo.style, {position:"absolute", left:`${document.documentElement.clientWidth - 96}px`, top:`${innerHeight - 54}px`, width:"88px"})
  document.body.append(combo); await combo.updateComplete; await layout()
  const field = combo.shadowRoot!.querySelector<HTMLElement>(".combobox")!
  field.click(); await combo.updateComplete; await layout()
  const listbox = combo.shadowRoot!.querySelector<HTMLElement>(".listbox")!
  let fieldRect = field.getBoundingClientRect(), listRect = listbox.getBoundingClientRect()
  try { insideViewport(listRect, document.documentElement.clientWidth, document.documentElement.clientHeight, "combobox listbox") }
  catch(error) {
    const style = getComputedStyle(listbox)
    throw new Error(`${String(error)}; trigger=${JSON.stringify(fieldRect.toJSON())}; host=${JSON.stringify(combo.getBoundingClientRect().toJSON())}; host-style=${combo.style.cssText}; list-style=${listbox.getAttribute("style")}; viewport=${innerWidth}x${innerHeight}; position-anchor=${style.getPropertyValue("position-anchor")}; position-area=${style.getPropertyValue("position-area")}; fallbacks=${style.getPropertyValue("position-try-fallbacks")}`)
  }
  assert(listRect.top >= fieldRect.bottom - 1 || listRect.bottom <= fieldRect.top + 1,
    "combobox listbox is detached from its trigger")
  const listStyle = getComputedStyle(listbox)
  assert(listStyle.backgroundColor === "rgb(255, 255, 255)" && parseFloat(listStyle.fontSize) >= 12,
    "combobox listbox lost its readable white surface styling")
  const beforeReflow = {field:fieldRect, list:listRect}
  scrollTo(0, 30); await layout()
  fieldRect = field.getBoundingClientRect(); listRect = listbox.getBoundingClientRect()
  assert(Math.abs((listRect.top - beforeReflow.list.top) - (fieldRect.top - beforeReflow.field.top)) < 1,
    "open combobox listbox did not follow native document scrolling")
  insideViewport(listRect, document.documentElement.clientWidth, document.documentElement.clientHeight, "scrolled combobox listbox")
  if(inspect) return
  combo.close(); await combo.updateComplete
  button.remove(); combo.remove()
  document.body.replaceChildren()
  document.body.style.cssText = ""
}

if(new URLSearchParams(location.search).has("inspect")) await window.runPopupAnchorCheck(true)
