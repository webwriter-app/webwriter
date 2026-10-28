import {getContainer} from "./utility"
import type {DistributionReaderContext} from "./distribution-reader"

/** New copies receive identities; references internal to a template follow those identities. */
function copy(element: Element): Element {
  const clone = element.cloneNode(true) as Element
  const ids = new Map<string, string>()
  for(const child of [clone, ...clone.querySelectorAll("[id]")]) if(child.id) {
    const id = `ww${crypto.randomUUID()}`
    ids.set(child.id, id); child.id = id
  }
  for(const child of [clone, ...clone.querySelectorAll("*")]) {
    for(const name of ["for", "aria-labelledby", "aria-describedby", "headers"]) if(child.hasAttribute(name)) {
      child.setAttribute(name, child.getAttribute(name)!.split(/\s+/).map(id => ids.get(id) ?? id).join(" "))
    }
    for(const name of ["href", "xlink:href"]) {
      const value = child.getAttribute(name)
      if(value?.startsWith("#") && ids.has(value.slice(1))) child.setAttribute(name, `#${ids.get(value.slice(1))}`)
    }
  }
  return clone
}

export function installInsert(context: DistributionReaderContext) {
  const picker = context.root.createElement("select")
  picker.setAttribute("aria-label", "Reader palette")
  const insert = context.root.createElement("button")
  insert.type = "button"; insert.textContent = "Insert"
  const refresh = () => {
    const anchor = context.root.getSelection()?.anchorNode
    const target = context.selected() ?? (anchor && context.root.body.contains(anchor) ? getContainer(anchor) : context.root.body)
    const config = context.policy(target)
    const allowed = context.allows("insert", target)
    const previous = picker.value
    picker.replaceChildren(...(allowed ? config?.items ?? [] : []).map(item => {
      const option = context.root.createElement("option"); option.value = item.id; option.textContent = item.label; return option
    }))
    if(Array.from(picker.options).some(option => option.value === previous)) picker.value = previous
    insert.disabled = !picker.options.length
    picker.hidden = insert.hidden = !allowed
    context.controls.parentElement!.hidden = !allowed
  }
  insert.addEventListener("click", () => {
    const anchor = context.root.getSelection()?.anchorNode
    const target = context.selected() ?? (anchor && context.root.body.contains(anchor) ? getContainer(anchor) : context.root.body)
    const config = context.policy(target), item = config?.items.find(item => item.id === picker.value)
    if(!context.allows("insert", target) || !config || !item || !(config.add.includes(item.id) || config.add.includes("element:*") && item.id.startsWith("element:"))) return
    if(target.localName.includes("-") || target.hasAttribute("is")) { context.message("Select an insertion container outside the widget."); return }
    const template = context.root.createElement("template")
    template.innerHTML = item.html
    const nodes = Array.from(template.content.childNodes).map(node => node.nodeType === 1 ? copy(node as Element) : node.cloneNode(true))
    context.mutate(() => target.append(...nodes), target)
  })
  context.controls.append(picker, insert)
  context.listen(context.root, "click", refresh)
  context.listen(context.root.defaultView!, "webwriter-distribution-ready", refresh)
  context.listen(context.root.defaultView!, "webwriter-distribution-selection", refresh)
  refresh()
}
