import {EditorFeature} from "."
import {
  WEBWRITER_GENERATOR,
  documentHeadElementKinds,
  type DocumentHeadElementKind,
  type DocumentHeadElementState,
  type DocumentHeadField,
  type DocumentHeadState,
} from "../document-head"
import {documentTheme} from "../document-themes"

const editorOnlySelector = ".◆editor-only, [data-webwriter-editor-only]"
const textContentElements = new Set(["script", "style", "title", "noscript", "template"])

const metaName = (element: Element) => element.localName === "meta"
  ? element.getAttribute("name")?.trim().toLowerCase() ?? ""
  : ""

const relTokens = (element: Element) => (element.getAttribute("rel") ?? "")
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean)

const isEditorOnly = (element: Element) => element.matches(editorOnlySelector)
  || element.closest(editorOnlySelector) !== null

const presetFor = (element: Element) => {
  if(element.localName === "title") return "title"
  if(element.localName === "base") return "base"
  if(element.localName === "style") {
    const themeName = element.getAttribute("data-ww-theme") ?? ""
    return documentTheme(themeName) ? "theme" : "style"
  }
  if(element.localName === "script") return "script"
  if(element.localName === "noscript") return "noscript"
  if(element.localName === "template") return "template"
  if(element.localName === "link") {
    if(relTokens(element).includes("stylesheet")) return "stylesheet"
    if(relTokens(element).includes("license")) return "license"
    return "link"
  }
  if(element.localName !== "meta") return undefined
  if(element.hasAttribute("charset")) return "charset"
  if(element.hasAttribute("http-equiv")) return "pragma"
  return metaName(element) || "meta"
}

const labelFor = (element: Element) => {
  const preset = presetFor(element)
  const names: Record<string, string> = {
    title: "Title",
    base: "Base URL",
    style: "Style",
    theme: "Theme",
    script: "Script",
    noscript: "NoScript",
    template: "Template",
    stylesheet: "Stylesheet",
    license: "License",
    link: "Link",
    charset: "Encoding",
    pragma: "Pragma",
    description: "Description",
    keywords: "Keywords",
    author: "Author",
    generator: "Generator",
    "theme-color": "Theme color",
    meta: "Metadata",
  }
  return names[preset ?? ""] ?? (preset ? `Metadata: ${preset}` : `<${element.localName}>`)
}

const contentLabelFor = (element: Element) => {
  if(element.localName === "script") return "JavaScript"
  if(element.localName === "style") return "CSS"
  if(element.localName === "template") return "HTML"
  return "Content"
}

/** Direct, DOM-native editing of authored document-head elements. */
export class HeadFeature extends EditorFeature {
  private readonly ids = new WeakMap<Element, string>()
  private readonly elementsById = new Map<string, Element>()
  private idSequence = 0
  private readonly observer = new (document.defaultView?.MutationObserver ?? MutationObserver)(mutations => {
    const head = document.head
    const relevant = mutations.some(mutation => (
      mutation.target === head
      || head.contains(mutation.target)
      || mutation.type === "attributes"
        && mutation.target === document.documentElement
        && mutation.attributeName?.toLowerCase() === "lang"
    ))
    if(relevant) this.postState()
  })

  actions = {
    setDocumentHeadField: ({field, value}: {
      type: "setDocumentHeadField"
      field: DocumentHeadField
      value: string
    }) => this.setField(field, value),
    addDocumentHeadElement: ({kind}: {
      type: "addDocumentHeadElement"
      kind: DocumentHeadElementKind
    }) => this.addElement(kind),
    removeDocumentHeadElement: ({id}: {type: "removeDocumentHeadElement", id: string}) =>
      this.removeElement(id),
    moveDocumentHeadElement: ({id, direction}: {
      type: "moveDocumentHeadElement"
      id: string
      direction: "up" | "down"
    }) => this.moveElement(id, direction),
    setDocumentHeadElementContent: ({id, value}: {
      type: "setDocumentHeadElementContent"
      id: string
      value: string
    }) => this.setElementContent(id, value),
    setDocumentHeadElementAttribute: ({id, name, value, previousName}: {
      type: "setDocumentHeadElementAttribute"
      id: string
      name: string
      value: string
      previousName?: string
    }) => this.setElementAttribute(id, name, value, previousName),
    removeDocumentHeadElementAttribute: ({id, name}: {
      type: "removeDocumentHeadElementAttribute"
      id: string
      name: string
    }) => this.removeElementAttribute(id, name),
  } as const

  enable() {
    if(this.isEnabled) return
    super.enable()
    this.observer.observe(document.head, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    })
    this.postState()
  }

  disable() {
    if(!this.isEnabled) return
    this.observer.disconnect()
    this.elementsById.clear()
    super.disable()
  }

  state(): DocumentHeadState {
    const elements = this.authoredElements()
    this.elementsById.clear()
    const elementStates = elements.map((element, index) => this.elementState(element, index, elements.length))
    return {
      title: this.firstTitle()?.textContent ?? "",
      description: this.firstMeta("description")?.getAttribute("content") ?? "",
      keywords: this.firstMeta("keywords")?.getAttribute("content") ?? "",
      author: this.firstMeta("author")?.getAttribute("content") ?? "",
      license: this.firstLicense()?.getAttribute("href") ?? "",
      language: document.documentElement.getAttribute("lang") ?? "",
      theme: this.firstTheme()?.getAttribute("data-ww-theme") ?? "",
      generator: this.firstMeta("generator")?.getAttribute("content") ?? "",
      elements: elementStates,
    }
  }

  postState() {
    if(!this.isEnabled) return
    this.editor.postDocumentHeadState(this.state())
  }

  private authoredElements() {
    return Array.from(document.head.children).filter(element => !isEditorOnly(element))
  }

  private elementId(element: Element) {
    const existing = this.ids.get(element)
    if(existing) return existing
    const id = `head-${++this.idSequence}`
    this.ids.set(element, id)
    return id
  }

  private filteredAttributes(element: Element) {
    return Array.from(element.attributes).flatMap(attribute => {
      if(attribute.name === "data-webwriter-editor-only") return []
      if(attribute.name.toLowerCase() !== "class") return [{name: attribute.name, value: attribute.value}]
      const value = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).join(" ")
      return value ? [{name: attribute.name, value}] : []
    })
  }

  private elementState(element: Element, index: number, count: number): DocumentHeadElementState {
    const id = this.elementId(element)
    this.elementsById.set(id, element)
    const preset = presetFor(element)
    const hasContent = textContentElements.has(element.localName) && preset !== "theme"
    const content = element instanceof HTMLTemplateElement ? element.innerHTML : element.textContent ?? ""
    return {
      id,
      tagName: element.localName,
      label: labelFor(element),
      attributes: this.filteredAttributes(element),
      ...(hasContent ? {content, contentLabel: contentLabelFor(element)} : {}),
      ...(preset ? {preset} : {}),
      canMoveUp: index > 0,
      canMoveDown: index < count - 1,
    }
  }

  private firstMeta(name: string) {
    return this.authoredElements()
      .find(element => metaName(element) === name.toLowerCase()) ?? null
  }

  private firstLicense() {
    return this.authoredElements()
      .find(element => element.localName === "link" && relTokens(element).includes("license")) ?? null
  }

  private firstTitle() {
    return this.authoredElements().find(element => element.localName === "title") ?? null
  }

  private firstTheme() {
    return this.authoredElements()
      .find(element => element.localName === "style"
        && documentTheme(element.getAttribute("data-ww-theme") ?? "")) ?? null
  }

  private target(id: string) {
    const element = this.elementsById.get(id)
    return element?.isConnected && element.parentElement === document.head && !isEditorOnly(element)
      ? element
      : null
  }

  private commit<T>(change: () => T) {
    this.editor.doc.stopCapturing()
    this.editor.doc.stopObserve()
    try {
      const result = change()
      this.editor.doc.syncFromDOM()
      this.editor.doc.stopCapturing()
      this.postState()
      return result
    }
    finally {
      this.editor.doc.startObserve()
    }
  }

  private insertAuthored(element: Element) {
    const firstEditorElement = Array.from(document.head.children).find(isEditorOnly)
    document.head.insertBefore(element, firstEditorElement ?? null)
  }

  private setSingletonMeta(name: string, value: string) {
    const current = this.firstMeta(name)
    if(!value.trim()) {
      if(!current) return false
      current.remove()
      return true
    }
    if(current?.getAttribute("content") === value) return false
    const meta = current ?? document.createElement("meta")
    if(!current) {
      meta.setAttribute("name", name)
      this.insertAuthored(meta)
    }
    meta.setAttribute("content", value)
    return true
  }

  private setField(field: DocumentHeadField, value: string) {
    return this.commit(() => {
      if(field === "language") {
        if((document.documentElement.getAttribute("lang") ?? "") === value) return false
        if(value.trim()) document.documentElement.setAttribute("lang", value)
        else document.documentElement.removeAttribute("lang")
        return true
      }
      if(field === "title") {
        const current = this.firstTitle()
        if(!value.trim()) {
          if(!current) return false
          current.remove()
        }
        else if(current) {
          if(current.textContent === value) return false
          current.textContent = value
        }
        else {
          const title = document.createElement("title")
          title.textContent = value
          this.insertAuthored(title)
        }
        return true
      }
      if(field === "license") {
        const current = this.firstLicense()
        if(!value.trim()) {
          if(!current) return false
          current.remove()
        }
        else {
          if(current?.getAttribute("href") === value) return false
          const link = current ?? document.createElement("link")
          if(!current) {
            link.setAttribute("rel", "license")
            this.insertAuthored(link)
          }
          link.setAttribute("href", value)
        }
        return true
      }
      if(field === "theme") {
        const current = this.firstTheme()
        if(!value.trim()) {
          if(!current) return false
          current.remove()
          return true
        }
        const theme = documentTheme(value)
        if(!theme) return false
        if(current?.getAttribute("data-ww-theme") === theme.value && current.textContent === theme.source) return false
        const style = current ?? document.createElement("style")
        if(!current) this.insertAuthored(style)
        style.setAttribute("data-ww-theme", theme.value)
        style.textContent = theme.source
        return true
      }
      const names: Record<Exclude<DocumentHeadField, "title" | "license" | "language" | "theme">, string> = {
        description: "description",
        keywords: "keywords",
        author: "author",
      }
      return this.setSingletonMeta(names[field], value)
    })
  }

  private createElement(kind: DocumentHeadElementKind) {
    if(!documentHeadElementKinds.includes(kind)) throw new TypeError(`Unsupported head element kind: ${kind}`)
    if(kind === "stylesheet") {
      const link = document.createElement("link")
      link.setAttribute("rel", "stylesheet")
      return link
    }
    if(kind === "pragma") {
      const meta = document.createElement("meta")
      meta.setAttribute("http-equiv", "")
      meta.setAttribute("content", "")
      return meta
    }
    if(kind === "charset") {
      const meta = document.createElement("meta")
      meta.setAttribute("charset", "utf-8")
      return meta
    }
    if(kind === "generator") {
      const meta = document.createElement("meta")
      meta.setAttribute("name", "generator")
      meta.setAttribute("content", WEBWRITER_GENERATOR)
      return meta
    }
    if(kind === "meta") {
      const meta = document.createElement("meta")
      meta.setAttribute("name", "")
      meta.setAttribute("content", "")
      return meta
    }
    if(kind === "link") return document.createElement("link")
    return document.createElement(kind)
  }

  private addElement(kind: DocumentHeadElementKind) {
    return this.commit(() => {
      const singletonPreset = kind === "charset" || kind === "title" || kind === "generator" || kind === "base"
        ? kind
        : null
      if(singletonPreset && this.authoredElements().some(element => presetFor(element) === singletonPreset)) {
        return false
      }
      const element = this.createElement(kind)
      if(kind === "charset") {
        const firstAuthored = Array.from(document.head.childNodes).find(node => !(
          node instanceof Element && isEditorOnly(node)
        ))
        document.head.insertBefore(element, firstAuthored ?? null)
      }
      else this.insertAuthored(element)
      return true
    })
  }

  private removeElement(id: string) {
    return this.commit(() => {
      const element = this.target(id)
      if(!element) return false
      element.remove()
      return true
    })
  }

  private moveElement(id: string, direction: "up" | "down") {
    return this.commit(() => {
      const element = this.target(id)
      if(!element) return
      const authored = this.authoredElements()
      const index = authored.indexOf(element)
      if(direction === "up" && index > 0) {
        document.head.insertBefore(element, authored[index - 1])
        return true
      }
      if(direction === "down" && index >= 0 && index < authored.length - 1) {
        document.head.insertBefore(authored[index + 1], element)
        return true
      }
      return false
    })
  }

  private setElementContent(id: string, value: string) {
    return this.commit(() => {
      const element = this.target(id)
      if(!element || !textContentElements.has(element.localName)) return false
      if(element instanceof HTMLTemplateElement) {
        if(element.innerHTML === value) return false
        element.innerHTML = value
      }
      else {
        if(element.textContent === value) return false
        element.textContent = value
      }
      return true
    })
  }

  private setElementAttribute(id: string, name: string, value: string, previousName?: string) {
    return this.commit(() => {
      const element = this.target(id)
      const nextName = name.trim()
      if(!element || !nextName || nextName.toLowerCase() === "data-webwriter-editor-only") return false
      if(nextName.toLowerCase() === "class") {
        value = value.split(/\s+/).filter(className => className && !className.startsWith("◆")).join(" ")
        if(!value) {
          if(!element.hasAttribute("class")) return false
          element.removeAttribute("class")
          return true
        }
      }
      const sameName = previousName === nextName || Boolean(previousName
        && element.namespaceURI === "http://www.w3.org/1999/xhtml"
        && previousName.toLowerCase() === nextName.toLowerCase())
      if(sameName && element.getAttribute(nextName) === value) return false
      element.setAttribute(nextName, value)
      if(previousName && !sameName) element.removeAttribute(previousName)
      return true
    })
  }

  private removeElementAttribute(id: string, name: string) {
    return this.commit(() => {
      const element = this.target(id)
      if(!element?.hasAttribute(name)) return false
      element.removeAttribute(name)
      return true
    })
  }
}
