import {tokenize} from "@csstools/css-tokenizer"

/** DOM-shaped snapshots are transient inputs to validation, never document state.
 * Both the browser DOM and the server HTML parser use this same comparison. */
export function validateDistributionChange(before, after, configs, parseFragment) {
  try {
    const policies = new Map(configs.map(config => [config.target, config]))
    const parents = new Map(), oldIds = new Map(), newIds = new Map(), oldElements = [], newElements = []
    const index = (node, parent, ids) => {
      parents.set(node, parent)
      if(node.attrs) (ids === oldIds ? oldElements : newElements).push(node)
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
      if(!config?.permissions.includes("insert")) return []
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
      const map = new Map()
      let depth = 0, property = null, value = [], expectColon = false
      const finish = () => {
        if(property === null) return
        if(expectColon || depth) throw new Error("Invalid style")
        map.set(property, value.join("").trim())
        property = null; value = []; expectColon = false
      }
      for(const [type, raw, , , data] of tokenize({css: text})) {
        if(type === "EOF-token") break
        if(type === "bad-string-token" || type === "bad-url-token") return null
        if(!depth && type === "semicolon-token") { finish(); continue }
        if(property === null) {
          if(type === "whitespace-token" || type === "comment") continue
          if(type !== "ident-token") return null
          property = data.value.startsWith("--") ? data.value : data.value.toLowerCase(); expectColon = true
        }
        else if(expectColon) {
          if(type === "whitespace-token" || type === "comment") continue
          if(type !== "colon-token") return null
          expectColon = false
        }
        else {
          if(["function-token", "(-token", "[-token", "{-token"].includes(type)) depth++
          else if([")-token", "]-token", "}-token"].includes(type)) { if(--depth < 0) return null }
          value.push(raw)
        }
      }
      finish()
      return map
    }
    const styleValueKey = value => value === undefined ? null : JSON.stringify(tokenize({css: value}).flatMap(([type, raw, , , data]) => {
      if(["whitespace-token", "comment", "EOF-token"].includes(type)) return []
      if(type === "url-token") return [["function-token", "url"], ["string-token", data.value], [")-token", ")"]]
      return [[type, type === "function-token" ? data.value.toLowerCase() : data?.value ?? raw, data?.unit?.toLowerCase()]]
    }))
    const unsafeStyleValue = value => /expression\s*\(|@import|javascript:/i.test(value)
      || tokenize({css: value}).some(([type, , , , data]) => type === "url-token" || type === "bad-url-token"
        || type === "function-token" && ["url", "expression"].includes(data.value.toLowerCase()))
    const attributes = (old, next) => {
      for(const name of new Set([...Object.keys(old.attrs), ...Object.keys(next.attrs)])) {
        if(old.attrs[name] === next.attrs[name]) continue
        if(name === "id") return false
        if(name === "style") {
          const value = next.attrs.style ?? ""
          const a = styleMap(old.attrs.style ?? ""), b = styleMap(value)
          if(!a || !b) return false
          if(!allows(old, "style") && !allows(old, "move")) return false
          for(const key of new Set([...a.keys(), ...b.keys()])) if(styleValueKey(a.get(key)) !== styleValueKey(b.get(key))) {
            if(unsafeStyleValue(b.get(key) ?? "")) return false
            if(!allows(old, "style") && !/^(?:left|top|right|bottom|translate|z-index|inset(?:-(?:inline|block)(?:-(?:start|end))?)?)$/.test(key)) return false
          }
        }
        else if(!allows(old, "edit") || !editableAttribute(old.name, name) || !safeAttribute(name, next.attrs[name] ?? "")) return false
      }
      return true
    }
    // Enter, line breaks and inline formatting use the editor's native DOM
    // operations. They are text editing, not palette/template insertion.
    const proseTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "br", "wbr", "span", "b", "strong", "i", "em", "u", "s", "sub", "sup", "small", "mark", "code", "kbd", "samp", "q", "abbr", "cite", "bdi", "bdo"])
    const textAttributes = node => { const attrs = {...node.attrs}; delete attrs.id; return attrs }
    const commentKey = node => JSON.stringify([policy(node)?.target, node.value])
    const commentCounts = root => {
      const counts = new Map()
      const visit = node => {
        if(node.name === "#comment") { const key = commentKey(node); counts.set(key, (counts.get(key) ?? 0) + 1) }
        node.children?.forEach(visit)
      }
      visit(root)
      return counts
    }
    const commentsBefore = commentCounts(before), commentsAfter = commentCounts(after)
    const retainedComment = node => {
      const key = commentKey(node)
      return commentsBefore.has(key) && commentsBefore.get(key) === commentsAfter.get(key)
    }
    const proseSources = []
    const collectProse = node => {
      if(proseTags.has(node.name) && allAllow(node, "edit")) proseSources.push(node)
      node.children?.forEach(collectProse)
    }
    collectProse(before)
    const prose = (node, inserted = false) => {
      if(node.name === "#text") return true
      if(node.name === "#comment") return retainedComment(node)
      if(!proseTags.has(node.name) || node.namespace !== "http://www.w3.org/1999/xhtml" || node.attrs?.is || policies.has(node.attrs?.id)) return false
      if(inserted && (node.attrs?.id || Object.keys(node.attrs ?? {}).length && !proseSources.some(source => source.name === node.name
        && same(textAttributes(source), textAttributes(node))))) return false
      return (node.children ?? []).every(child => prose(child, inserted))
    }
    // Elements do not need editor-generated IDs to move. Match unchanged DOM
    // subtrees first, reserving each old node once before considering edited peers.
    const unchanged = new Map(), reused = new Set()
    for(const next of newElements) {
      const old = next.attrs.id && oldIds.get(next.attrs.id)
      if(old) { unchanged.set(next, old); reused.add(old) }
    }
    const signatures = new Map()
    for(const old of oldElements) if(!old.attrs.id) {
      const key = JSON.stringify(old)
      if(!signatures.has(key)) signatures.set(key, [])
      signatures.get(key).push(old)
    }
    for(const next of newElements) if(!next.attrs.id) {
      const old = signatures.get(JSON.stringify(next))?.shift()
      if(old) { unchanged.set(next, old); reused.add(old) }
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
        const candidate = child.attrs?.id ? oldIds.get(child.attrs.id) : unchanged.get(child)
          ?? previous.find((value, index) => !used.has(index) && !reused.has(value) && compatible(value, child))
        if(candidate) {
          const index = previous.indexOf(candidate)
          if(index >= 0) used.add(index)
          matches.set(i, candidate)
          if(parents.get(candidate) !== old && (!(allAllow(candidate, "move") && allows(old, "move")
            || allAllow(candidate, "edit") && allows(old, "edit") && prose(candidate))
            || policy(candidate)?.target !== policy(old)?.target)) return false
        }
      }
      for(let i = 0; i < previous.length; i++) if(!used.has(i)) {
        const child = previous[i]
        if(reused.has(child) || child.attrs?.id && newIds.has(child.attrs.id)) {
          if(!allAllow(child, "move") && !(allAllow(child, "edit") && prose(child))) return false
        }
        else if(child.name === "#text") { if(!allows(old, "edit")) return false }
        else if(child.name === "#comment" && allows(old, "edit") && retainedComment(child)) continue
        else if(!child.attrs || !(allAllow(child, "delete") || allAllow(child, "edit") && prose(child))) return false
      }
      const oldOrder = previous.filter((_, index) => used.has(index))
      const newOrder = [...matches.values()].filter(child => parents.get(child) === old)
      // Moving a permitted item past a fixed sibling does not move that sibling.
      // Only the relative order of non-movable anchors must remain unchanged.
      const fixedBefore = oldOrder.filter(child => !allAllow(child, "move"))
      const fixedAfter = newOrder.filter(child => !allAllow(child, "move"))
      if(fixedBefore.some((child, index) => child !== fixedAfter[index])) return false
      for(let i = 0; i < current.length;) {
        const matched = matches.get(i)
        if(matched) { if(!compare(matched, current[i])) return false; i++; continue }
        let count = 0
        for(const template of templates(old)) {
          if(!template.length || template.some((_, offset) => matches.has(i + offset))) continue
          const added = current.slice(i, i + template.length)
          if(added.length === template.length && same(templateShape(added), templateShape(template))) { count = template.length; break }
        }
        if(!count && allows(old, "edit") && (current[i].name === "#text" || prose(current[i], true))) count = 1
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
