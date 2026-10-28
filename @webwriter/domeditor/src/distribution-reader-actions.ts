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

export function installDelete(context: DistributionReaderContext) {
  context.addButton("Delete", "delete", () => {
    const target = context.selected()
    if(target && target !== context.root.body && context.allows("delete", target)) context.mutate(() => target.remove(), target)
  })
}

export function installDuplicate(context: DistributionReaderContext) {
  context.addButton("Duplicate", "duplicate", () => {
    const target = context.selected()
    if(target && target !== context.root.body && context.allows("duplicate", target)) context.mutate(() => target.after(copy(target)), target)
  })
}

export function installMove(context: DistributionReaderContext) {
  for(const [label, direction] of [["Move earlier", -1], ["Move later", 1]] as const) context.addButton(label, "move", () => {
    const target = context.selected()
    const sibling = direction < 0 ? target?.previousElementSibling : target?.nextElementSibling
    if(!target || !sibling || !context.allows("move", target)) return
    context.mutate(() => { if(direction < 0) sibling.before(target); else sibling.after(target) }, target)
  })
}

function installResize(context: DistributionReaderContext) {
  const root = context.root
  const fields = root.createElement("div")
  fields.hidden = true
  const inputs = (["width", "height"] as const).map(property => {
    const label = root.createElement("label")
    label.textContent = `${property === "width" ? "Width" : "Height"} (px)`
    const input = root.createElement("input")
    input.type = "number"; input.min = "1"; input.max = "100000"; input.setAttribute("aria-label", label.textContent)
    label.append(input); fields.append(label)
    return {property, input}
  })
  const apply = root.createElement("button")
  apply.type = "button"; apply.textContent = "Apply size"
  let target: Element | null = null
  apply.addEventListener("click", () => {
    if(!target?.isConnected || context.selected() !== target || !context.allows("style", target)) { fields.hidden = true; return }
    const values = inputs.map(({input}) => Number(input.value))
    if(values.some(value => !Number.isFinite(value) || value < 1 || value > 100000)) return
    const style = (target as HTMLElement).style
    if(style) context.mutate(() => inputs.forEach(({property}, index) => style.setProperty(property, `${values[index]}px`)), target)
    fields.hidden = true
  })
  fields.append(apply); context.controls.after(fields)
  context.addButton("Size", "style", () => {
    target = context.selected()
    if(!target || !context.allows("style", target)) return
    const rect = target.getBoundingClientRect()
    inputs[0].input.value = String(Math.max(1, Math.round(rect.width)))
    inputs[1].input.value = String(Math.max(1, Math.round(rect.height)))
    fields.hidden = false; inputs[0].input.focus()
  })
}

export function installEdit(context: DistributionReaderContext) {
  const field = context.root.createElement("textarea")
  field.setAttribute("aria-label", "Element text")
  const apply = context.root.createElement("button")
  apply.type = "button"; apply.textContent = "Apply text"
  const panel = context.root.createElement("div")
  panel.hidden = true; panel.append(field, apply); context.controls.after(panel)
  let target: Element | null = null, original = ""
  context.addButton("Edit text", "edit", () => {
    target = context.selected()
    if(!target || !context.allows("edit", target)) return
    if(target.children.length || target.localName.includes("-") || target.hasAttribute("is")) {
      context.message("Select a text element without nested elements to edit its text."); return
    }
    original = target.textContent ?? ""; field.value = original; panel.hidden = false; field.focus()
  })
  apply.addEventListener("click", () => {
    if(!target?.isConnected || context.selected() !== target || target.children.length || target.textContent !== original || !context.allows("edit", target)) {
      panel.hidden = true; return
    }
    context.mutate(() => {
      const text = Array.from(target!.childNodes).filter((node): node is Text => node.nodeType === 3)
      if(text.length) { text[0].data = field.value; text.slice(1).forEach(node => node.remove()) }
      else target!.append(context.root.createTextNode(field.value))
    }, target)
    panel.hidden = true
  })
}

export function installStyle(context: DistributionReaderContext) {
  installResize(context)
  const panel = context.root.createElement("div"), field = context.root.createElement("textarea"), apply = context.root.createElement("button")
  panel.hidden = true; field.setAttribute("aria-label", "Element CSS declarations"); apply.type = "button"; apply.textContent = "Apply style"
  panel.append(field, apply); context.controls.after(panel)
  let target: Element | null = null, original: string | null = null
  context.addButton("Style", "style", () => {
    target = context.selected(); original = target?.getAttribute("style") ?? null
    field.value = original ?? ""; panel.hidden = !target; field.focus()
  })
  apply.addEventListener("click", () => {
    if(!target?.isConnected || target !== context.selected() || target.getAttribute("style") !== original || !context.allows("style", target)) return
    context.mutate(() => target!.setAttribute("style", field.value), target)
    panel.hidden = true
  })
}

export function installInsert(context: DistributionReaderContext) {
  const picker = context.root.createElement("select")
  picker.setAttribute("aria-label", "Reader palette")
  const insert = context.root.createElement("button")
  insert.type = "button"; insert.textContent = "Add"
  const refresh = () => {
    const target = context.selected() ?? context.root.body
    const config = context.policy(target)
    const previous = picker.value
    picker.replaceChildren(...(config?.items ?? []).map(item => {
      const option = context.root.createElement("option"); option.value = item.id; option.textContent = item.label; return option
    }))
    if(Array.from(picker.options).some(option => option.value === previous)) picker.value = previous
    insert.disabled = !picker.options.length
  }
  insert.addEventListener("click", () => {
    const target = context.selected() ?? context.root.body
    const config = context.policy(target), item = config?.items.find(item => item.id === picker.value)
    if(!config || !item || !(config.add.includes(item.id) || config.add.includes("element:*") && item.id.startsWith("element:"))) return
    if(target.localName.includes("-") || target.hasAttribute("is")) { context.message("Select an insertion container outside the widget."); return }
    const template = context.root.createElement("template")
    template.innerHTML = item.html
    const nodes = Array.from(template.content.childNodes).map(node => node.nodeType === 1 ? copy(node as Element) : node.cloneNode(true))
    context.mutate(() => target.append(...nodes), target)
  })
  context.controls.append(picker, insert)
  context.listen(context.root, "click", refresh)
  context.listen(context.root.defaultView!, "webwriter-distribution-ready", refresh)
  refresh()
}
