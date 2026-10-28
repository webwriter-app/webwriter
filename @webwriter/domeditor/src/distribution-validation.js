/** DOM-shaped snapshots are transient inputs to validation, never document state.
 * Both the browser DOM and the server HTML parser use this same comparison. */
export function validateDistributionChange(before, after, configs, parseFragment) {
  try {
    const policies = new Map(configs.map(config => [config.target, config]))
    const parents = new Map(), oldIds = new Map(), newIds = new Map()
    const index = (node, parent, ids) => {
      parents.set(node, parent)
      const id = node.attrs?.id
      if(id) {
        if(ids.has(id)) throw new Error("Duplicate element identity")
        ids.set(id, node)
      }
      for(const child of node.children ?? []) index(child, node, ids)
    }
    index(before, null, oldIds)
    index(after, null, newIds)
    for(const target of policies.keys()) if(!oldIds.has(target) && newIds.has(target)) return false
    const policy = node => {
      for(let current = node; current; current = parents.get(current)) {
        const config = policies.get(current.attrs?.id)
        if(config) return config
      }
      return null
    }
    const allows = (node, permission) => Boolean(policy(node)?.permissions.includes(permission))
    const allAllow = (node, permission) => allows(node, permission)
      && (node.children ?? []).every(child => !child.attrs || allAllow(child, permission))
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    const shape = (node, ids = new Map()) => {
      const attrs = {...node.attrs}
      if(attrs.id) { if(!ids.has(attrs.id)) ids.set(attrs.id, `copy-${ids.size}`); attrs.id = ids.get(attrs.id) }
      for(const name of ["for", "aria-labelledby", "aria-describedby", "headers"]) if(attrs[name]) {
        attrs[name] = attrs[name].split(/\s+/).map(id => ids.get(id) ?? id).join(" ")
      }
      if(attrs.href?.startsWith("#") && ids.has(attrs.href.slice(1))) attrs.href = `#${ids.get(attrs.href.slice(1))}`
      return {...node, ...(node.attrs ? {attrs} : {}), children: node.children?.map(child => shape(child, ids))}
    }
    const templateShape = nodes => {
      const ids = new Map()
      const collect = node => { if(node.attrs?.id && !ids.has(node.attrs.id)) ids.set(node.attrs.id, `copy-${ids.size}`); node.children?.forEach(collect) }
      nodes.forEach(collect)
      return nodes.map(node => shape(node, ids))
    }
    const templateCache = new Map()
    const templates = node => {
      const config = policy(node)
      if(!config) return []
      if(!templateCache.has(config)) templateCache.set(config, config.items
        .filter(item => config.add.includes(item.id) || config.add.includes("element:*") && item.id.startsWith("element:"))
        .map(item => parseFragment(item.html)))
      return templateCache.get(config)
    }
    const editableAttribute = (tag, name) => {
      const names = {img: ["src", "alt"], source: ["src", "type", "media"], video: ["src", "poster", "controls", "muted", "loop"],
        audio: ["src", "controls", "muted", "loop"], a: ["href", "title"], input: ["value", "checked"],
        option: ["selected", "value"], details: ["open"], textarea: ["value"]}
      return names[tag]?.includes(name) ?? false
    }
    const safeAttribute = (name, value) => !/^on|^contenteditable$|^srcdoc$|^nonce$|^is$/i.test(name)
      && (!/^(?:href|src|poster)$/i.test(name) || !/^[\s\u0000-\u0020]*(?:javascript|vbscript|data):/i.test(value))
      && !/[\u0000-\u001f]/.test(value)
    const styleMap = text => {
      // Do not split functions or strings. Ambiguous styles need full style permission.
      if(/[()"'\\]/.test(text)) return null
      const entries = text.split(";").filter(value => value.trim()).map(value => {
        const colon = value.indexOf(":")
        if(colon < 1) throw new Error("Invalid style")
        return [value.slice(0, colon).trim().toLowerCase(), value.slice(colon + 1).trim()]
      })
      if(new Set(entries.map(([key]) => key)).size !== entries.length) return null
      return new Map(entries)
    }
    const attributes = (old, next) => {
      for(const name of new Set([...Object.keys(old.attrs), ...Object.keys(next.attrs)])) {
        if(old.attrs[name] === next.attrs[name]) continue
        if(name === "id") return false
        if(name === "style") {
          const value = next.attrs.style ?? ""
          if(/url\s*\(|expression\s*\(|@import|javascript:/i.test(value)) return false
          if(allows(old, "style")) continue
          if(!allows(old, "move")) return false
          const a = styleMap(old.attrs.style ?? ""), b = styleMap(value)
          if(!a || !b) return false
          for(const key of new Set([...a.keys(), ...b.keys()])) if(a.get(key) !== b.get(key)
            && !/^(?:left|top|right|bottom|translate)$/.test(key)) return false
        }
        else if(!allows(old, "edit") || !editableAttribute(old.name, name) || !safeAttribute(name, next.attrs[name] ?? "")) return false
      }
      return true
    }
    const compatible = (a, b) => a.name === b.name && a.namespace === b.namespace
      && (a.attrs?.id || b.attrs?.id ? a.attrs?.id === b.attrs?.id : true)
    const compare = (old, next) => {
      if(same(old, next)) return true
      if(!compatible(old, next)) return false
      if(!old.attrs) return old.name === "#text" && allows(parents.get(old), "edit")
      if(!attributes(old, next)) return false
      // Widget data has its own scoped binding and authorization contract.
      if(old.name === "script" && old.attrs.slot === "data" && !old.attrs.src
        && ["application/json", "application/xml"].includes(old.attrs.type)
        && parents.get(old)?.name.includes("-")) return true
      const previous = old.children ?? [], current = next.children ?? []
      const used = new Set(), matches = new Map()
      for(let i = 0; i < current.length; i++) {
        const child = current[i]
        const candidate = child.attrs?.id ? oldIds.get(child.attrs.id) : previous.find((value, index) => !used.has(index) && compatible(value, child))
        if(candidate) {
          const index = previous.indexOf(candidate)
          if(index >= 0) used.add(index)
          matches.set(i, candidate)
          if(parents.get(candidate) !== old && (!allAllow(candidate, "move") || !allows(old, "move")
            || policy(candidate)?.target !== policy(old)?.target)) return false
        }
      }
      for(let i = 0; i < previous.length; i++) if(!used.has(i)) {
        const child = previous[i]
        if(child.attrs?.id && newIds.has(child.attrs.id)) {
          if(!allAllow(child, "move")) return false
        }
        else if(child.name === "#text") { if(!allows(old, "edit")) return false }
        else if(!child.attrs || !allAllow(child, "delete")) return false
      }
      const oldOrder = previous.filter((_, index) => used.has(index))
      const newOrder = [...matches.values()].filter(child => parents.get(child) === old)
      if(oldOrder.some((child, index) => child !== newOrder[index]) && newOrder.some(child => !allAllow(child, "move"))) return false
      for(let i = 0; i < current.length;) {
        const matched = matches.get(i)
        if(matched) { if(!compare(matched, current[i])) return false; i++; continue }
        let count = 0
        for(const template of templates(old)) {
          if(!template.length || template.some((_, offset) => matches.has(i + offset))) continue
          const added = current.slice(i, i + template.length)
          if(added.length === template.length && same(templateShape(added), templateShape(template))) { count = template.length; break }
        }
        if(!count && current[i].name === "#text" && allows(old, "edit")) count = 1
        if(!count && allows(old, "duplicate")) {
          const candidate = [...oldIds.values()].find(node => allAllow(node, "duplicate")
            && policy(node)?.target === policy(old)?.target && same(templateShape([node]), templateShape([current[i]])))
          if(candidate) count = 1
        }
        if(!count) return false
        i += count
      }
      return true
    }
    // Only BODY is editable. Head instructions, resources and HTML attributes are immutable to readers.
    if(before.name !== "html" || after.name !== "html" || !same(before.attrs, after.attrs)) return false
    const oldHead = before.children.find(node => node.name === "head"), newHead = after.children.find(node => node.name === "head")
    if(!same(oldHead, newHead)) return false
    const oldBody = before.children.find(node => node.name === "body"), newBody = after.children.find(node => node.name === "body")
    if(!oldBody || !newBody) return false
    return compare(oldBody, newBody)
  }
  catch { return false }
}
