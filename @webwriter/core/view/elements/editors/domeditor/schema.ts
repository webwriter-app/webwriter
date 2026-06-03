import { baseSchema } from "./baseschema"
import { $, getContainer, getIndexBefore, getSidesOfPoint } from "./utility"

type ContentRuleTransparent = {
  transparent: true,
  selector?: string,
  min?: number,
  max?: number
}

type ContentRuleGroup = {
  group: string,
  selector?: string,
  min?: number,
  max?: number
}

type ContentRuleSelector = {
  selector: string | {type: "text"} | {type: "comment"},
  min?: number,
  max?: number
}

type ContentRuleSequence = {
  terms: ContentRule[],
  min?: number,
  max?: number
}

type ContentRuleChoice = {
  options: ContentRule[],
  min?: number,
  max?: number
}

type ContentRuleConjunction = {
  conditions: ContentRule[],
  min?: number,
  max?: number
}

type ContentRule = ContentRuleSelector | ContentRuleSequence | ContentRuleChoice | ContentRuleConjunction | ContentRuleTransparent | ContentRuleGroup

type SchemaEntry = {
  group?: string[],
  content?: ContentRule,
  headOnly?: boolean,
  sideEffects?: boolean,
  emptySelector?: string,
  emptyStyle?: Record<string, string>,
  placeholderStyle?: Record<string, string>,
  inseperable?: boolean,
  defaultNode?: boolean,
  contentNamespace?: string
}

export class Schema {
  
  static baseSchema: Record<string, SchemaEntry> = baseSchema as any
  #schema: Record<string, SchemaEntry> = {}
  #nodes: Record<string, Node> = {}
  #groups: Record<string, string[]> = {}
  
  constructor(baseSchema: Record<string, SchemaEntry> = Schema.baseSchema) {
    this.extend(baseSchema)
  }

  extend(extensionSchema: Record<string, SchemaEntry>) {
    this.#schema = {...this.#schema, ...extensionSchema}
    this.#nodes = Object.fromEntries(Object.keys(extensionSchema)
      .filter(k => k !== "#unknownelement")
      .map(k => [k, this.create(k)])
    )
    Object.keys(extensionSchema)
      .forEach(k => this.#schema[k].group?.forEach(g => {
        this.#groups[g] = [...(this.#groups[g] ?? []), k]
      }))
  }

  get defaultNodeKey() {
    return Object.keys(this.#schema).find(k => this.#schema[k].defaultNode) ?? "#text"
  }

  get defaultNodeType() {
    return this.#schema[this.defaultNodeKey]
  }

  get(nodeOrKey: Node | string) {
    return nodeOrKey instanceof Node? this.#getTypeOfNode(nodeOrKey): this.#schema[nodeOrKey]
  }

  create(key: string = this.defaultNodeKey) {
    if(key === "#text") {
      return document.createTextNode("")
    }
    else if(key === "#comment") {
      return document.createComment("")
    }
    else {
      return key.includes("|")
        ? document.createElementNS(
          this.getNamespaceURL(key.split("|").at(0)!),
          key.split("|").at(1)!)
        : document.createElement(key)
    }
  }

  get placeholderKeys() {
    return Object.keys(this.#schema).filter(k => (this.#schema as any)[k].emptySelector && ((this.#schema as any)[k].placeholderStyle || (this.#schema as any)[k].emptyStyle))
  }

  get namespaceTypes(): SchemaEntry & {[k: string]: {contentNamespace: string}} {
    return Object.fromEntries(Object.entries(this.#schema)
      .filter(([,v]) => v.contentNamespace)) as any
  }

  getNamespaceURL(key: string) {
    return this.namespaceTypes[key].contentNamespace
  }

  getNamespaceNameOfElement(node: Element) {
    const {namespaceTypes} = this
    while(node.parentElement) {
      node = node.parentElement
      const k = node.tagName.toLowerCase()
      if(k in namespaceTypes) return k
    }
  }

  getNamespaceOfElement(node: Element) {
    const {namespaceTypes} = this
    while(node.parentElement) {
      node = node.parentElement
      const nsType = namespaceTypes[node.tagName.toLowerCase()]
      if(nsType) return nsType.contentNamespace!
    }
  }

  #getTypeOfNode(node: Node) {
    if(node instanceof Element) {      
      const ns = this.getNamespaceNameOfElement(node)
      if(ns) {
        return this.#schema[`${ns}|` + node.tagName.toLowerCase()]
      }
      else if(node.tagName.toLowerCase() in this.#schema) {
        return this.#schema[node.tagName.toLowerCase()]
      }
      else {
        return this.#schema["#unknownelement"]
      }
    }
    else if(node.nodeType === Node.TEXT_NODE) {
      return this.#schema["#text"]
    }
    else if(node.nodeType === Node.COMMENT_NODE) {
      return this.#schema["#comment"]
    }
    else {
      throw TypeError("Unsupported node type")
    }
  }

  isPhrasing(nodeOrKey: Node | string) {
    return this.get(nodeOrKey).group?.includes("phrasing")
  }

  isBlock(nodeOrKey: Node | string) {
    const contentTypes = this.findValidContentTypes(nodeOrKey)
    return contentTypes.includes("phrasing")
  }

  getGroupMembers(key: string) {
    return Array.from(this.#groups[key])
  }

  canReplace(toReplace: Node, replacement: Node) {
    const container = toReplace.parentElement
    if(!container) {
      return false
    }
    const childNodes = Array.from(container.childNodes)
    childNodes.splice(childNodes.indexOf(toReplace as ChildNode), 1, replacement as ChildNode)
    return this.isContentValid(container, childNodes)
  }

  canInsert(container: Node, insertee: Node, start: number, end?: number) {
    const rule = this.#getTypeOfNode(container).content
    if(!rule) {
      return false
    }
    const childNodes = Array.from(container.childNodes)
    childNodes.splice(start, (end ?? start) - start, insertee as ChildNode)
    return this.isContentValid(container, childNodes)
  }

  canSplit(container: Node, insertee?: Node) {
    const childNodes = Array.from(container.childNodes)
    const index = childNodes.indexOf(insertee as ChildNode)
    const newChildNodes = [
      ...childNodes.slice(0, index + 1),
      ...(!insertee? []: [insertee]),
      container.cloneNode(),
      ...childNodes.slice(index + 1)
    ]
    return this.isContentValid(container, newChildNodes)
  }

  canWrap(wrapper: Element | string, content: Node[]) {
    console.log(wrapper, content)
    return this.isContentValid(wrapper, content)
  }

  getLiftTarget(node: Node, parent:Element|null=node.parentElement, siblings:Node[]=Array.from(node.parentElement?.childNodes ?? [])): [number, Node[]] | null {
    let grandparent = parent?.parentElement ?? null
    if (!parent || !grandparent || grandparent.nodeName === "HTML") {
      return null
    }
    else {
      const parentSchema = this.get(parent)
      const grandsiblings = Array.from(grandparent.childNodes)
      const iParent = siblings.indexOf(node as ChildNode)
      const iGrandparent = grandsiblings.indexOf(parent)
      const leftChildren = siblings.slice(0, iParent); const rightChildren = siblings.slice(iParent + 1)
      const wouldSliceInseparable = parentSchema.inseperable && leftChildren.length && rightChildren.length
      if(wouldSliceInseparable || !this.isContentValid(parent, [...leftChildren, ...rightChildren])) return null;
      const leftParent = leftChildren.length? parent.cloneNode() as Element: null; leftParent?.append(...leftChildren)
      const rightParent = rightChildren.length? parent.cloneNode() as Element: null; rightParent?.append(...rightChildren)
      const liftInsert = [leftParent, node, rightParent].filter(n => n) as Node[]
      const grandparentContent = [
        ...grandsiblings.slice(0, iGrandparent),
        ...liftInsert,
        ...grandsiblings.slice(iGrandparent + 1)
      ]
      if(this.isContentValid(grandparent, grandparentContent)) {
        return [1, liftInsert]
      }
      else {
        const [k, liftInsert] = this.getLiftTarget(node, grandparent, grandparentContent) ?? []
        if(!k || !liftInsert) return null;
        return [1 + k, liftInsert]
      }
    }
  }

  

  findInvalidNodes(root: Node = document): Element[] {
    const walker = document.createTreeWalker(root)
    const invalidNodes = []
    while(walker.nextNode()) {
      const node = walker.currentNode
      if(!this.isContentValid(node)) {
        invalidNodes.push(node)
      }
    }
    return invalidNodes as Element[]
  }

  private getContentRule(nodeOrKey: Node | string) {
    return this.get(nodeOrKey).content
  }

  private hasRuleRemainingMin(rule: ContentRule) {
    return (rule.min ?? 1) >= 1
  }

  isContentValid(node: Node | string, content?: Node[], rule=structuredClone(this.getContentRule(node))) {
    let nodeToCheck = typeof node === "string"? this.create(node): node
    
    if(!(nodeToCheck instanceof Element)) return true;
    if(!rule) return false;
    const contentToCheck = content ?? Array.from(nodeToCheck.childNodes)
    const everyNodeValid = contentToCheck.every(node => this.isNodeValid(node, rule))
    const hasRemainingMin = this.hasRuleRemainingMin(rule)
    return everyNodeValid && !hasRemainingMin
  }

  isNodeValid(node: Node, rule=structuredClone(this.getContentRule(node.parentElement!))): boolean {
    if(node instanceof Element && node.getAttribute("contenteditable") === "false") {
      return true
    }
    if(!rule) {
      console.error(`${node.nodeName} invalid: No content allowed in parent`)
      return false
    }
    else if("options" in rule) {
      const {min, max, options} = rule
      if(options.length === 0) return false;
      const valid = (max ?? 1) > 0 && options.some(option => this.isNodeValid(node, option))
      if(valid) {
        rule.min = Math.max(0, (rule.min ?? 1) - 1)
        rule.max = Math.max(0, (rule.max ?? 1) - 1)
        return true
      } else return false
    }
    else if("group" in rule) {
      const {min, max, group} = rule
      const groupMembers = this.getGroupMembers(group)
      const valid = (max ?? 1) > 0 && groupMembers.some(member => member === node.nodeName.toLowerCase())
      if(valid) {
        rule.min = Math.max(0, (rule.min ?? 1) - 1)
        rule.max = Math.max(0, (rule.max ?? 1) - 1)
        return true
      } else return false
    }
    else if("terms" in rule) {
      const {min, max, terms} = rule
      if(terms.length === 0) return false;
      const firstUnsatisfied = terms.find(term => (term.max ?? 1) > 0)
      const valid = (max ?? 1) > 0 && this.isNodeValid(node, firstUnsatisfied)
      const allSatisfied = terms.every(term => (term.min ?? 1) < 1)
      if(valid) {
        if(allSatisfied) {
          rule.min = Math.max(0, (rule.min ?? 1) - 1)
          rule.max = Math.max(0, (rule.max ?? 1) - 1)
        }
        return true
      } else return false
    }
    else if("conditions" in rule) {
      const {min, max, conditions} = rule
      if(conditions.length === 0) return false;
      const valid = (max ?? 1) > 0 && conditions.every(cond => this.isNodeValid(node, cond))
      if(valid) {
        rule.min = Math.max(0, (min ?? 1) - 1)
        rule.max = Math.max(0, (min ?? 1) - 1)
        return true
      } else return false
    }
    else if("transparent" in rule) {
      while(node.parentElement) {
        const parentRule = this.getContentRule(node.parentElement)
        if(!parentRule) {
          return false
        }
        else if("transparent" in parentRule) {
          continue
        }
        else if("selector" in rule) {
          const nonTransparentRule = {selector: rule.selector!, min: rule.min, max: rule.max}
          const resolvedRule = {conditions: [nonTransparentRule, parentRule]}
          return this.isNodeValid(node, resolvedRule)
        }
        else {
          return this.isNodeValid(node, parentRule)
        }
      }
      return false
    }
    else if("selector" in rule) {
      const {min, max, selector} = rule
      const valid = (max ?? 1) > 0 && this.testSelectorRule(node, selector)
      if(valid) {
        rule.min = Math.max(0, (rule.min ?? 1) - 1)
        rule.max = Math.max(0, (rule.max ?? 1) - 1)
        return true
      } else return false
    }
    else {
      throw TypeError(`Invalid rule '${JSON.stringify(rule)}'`)
    }
  }

  fillByRule(
    containerOrKey: Node | string,
    rule=structuredClone(this.getContentRule(containerOrKey)), 
    content: Node[]=containerOrKey instanceof Node? Array.from(containerOrKey.childNodes): []    
  ) {
    if(!rule) throw Error("No content allowed in parent according to rule");
    const container = containerOrKey instanceof Node? containerOrKey: this.create(containerOrKey)
    if(this.isContentValid(container, content, structuredClone(rule))) return content;
    let newContent = [] as Node[]
    let executionCount = 0
    while((this.hasRuleRemainingMin(rule) || content.length) && executionCount < 10) {
      executionCount++
      if(content.length && this.isNodeValid(content.at(0)!, rule)) {
        newContent = [...newContent, content.shift()!]
      }
      else {
        const validContentTypes = this.findValidContentTypes(container, rule)
        if(!validContentTypes.length) throw Error("No possible fill for node");
        const newNode = this.create(validContentTypes.at(0)!)
        if(this.isNodeValid(newNode, rule)) {
          newContent = [...newContent, newNode];
        }
      }
    }
    return newContent
  }

  findValidContentTypes(
    containerOrKey: Node | string,
    rule=structuredClone(this.getContentRule(containerOrKey)), 
    content=containerOrKey instanceof Node? Array.from(containerOrKey.childNodes): []
  ): string[] {
    if(!rule || containerOrKey instanceof Node && !(containerOrKey instanceof Element)) {
      return []
    }

    const container = containerOrKey instanceof Node? containerOrKey: this.create(containerOrKey)

    if((rule.max ?? 1) < 1) {
      return []
    }
    
    if("group" in rule) {
      const groupKeys = this.getGroupMembers(rule.group)
      return groupKeys.filter(k => !rule.selector || this.testSelectorRule(this.#nodes[k], rule.selector))
    }
    else if("transparent" in rule) {
      const parent = container.parentElement
      if(!parent) {
        return []
      }
      const parentRule = this.getContentRule(parent)
      const validParentContentTypes = this.findValidContentTypes(parent, parentRule)
      return Object.keys(this.#nodes).filter(k => validParentContentTypes.includes(k) && (!rule.selector || this.testSelectorRule(this.#nodes[k], rule.selector)))
    }
    else if("options" in rule) {
      return Array.from(new Set(rule.options.flatMap(optRule => this.findValidContentTypes(container, optRule))))
    }
    else if("conditions" in rule) {
      const eachCondition = rule.conditions.map(optRule => this.findValidContentTypes(container, optRule))
      return Object.keys(this.#nodes).filter(k => eachCondition.every(cond => cond.includes(k)))
    }
    else if("terms" in rule) {
      const termRule = rule.terms.find(term => (term.max ?? 1) > 0)
      return this.findValidContentTypes(container, termRule)
    }
    else if("selector" in rule) {
      return Object.keys(this.#nodes).filter(k => this.testSelectorRule(this.#nodes[k], rule.selector))
    }
    else {
      throw TypeError(`Invalid rule '${JSON.stringify(rule)}'`)
    }
  }

  private testSelectorRule(node: Node, selector: ContentRuleSelector["selector"]) {
    const nodeTypeMap = {
      text: Node.TEXT_NODE,
      comment: Node.COMMENT_NODE
    }
    if(typeof selector === "object") {
      return node.nodeType === nodeTypeMap[selector.type]
    }
    else if(node instanceof Element) {
      return node.matches(selector)
    }
    else return false
  }

  findWrapping(container: Element, content: Node[]): Element | undefined {
    const index = Array.from(container.childNodes).indexOf(content[0] as ChildNode)
    const slice = Array.from(container.childNodes).slice(0, index)
    const validContentTypes = this.findValidContentTypes(container, undefined, slice)
    console.log(validContentTypes)
    const wrapperType = validContentTypes.find(k => this.canWrap(k, content))
    return wrapperType? this.create(wrapperType) as HTMLElement: undefined
  }

  lift(container: Element, node: Node, maxDepth=Infinity) {
    const siblings = Array.from(container.childNodes)
    if(!siblings.includes(node as ChildNode)) {
      throw TypeError("Cannot lift a node that is not a child of the container")
    }
    const point = new Range(); point.setStartBefore(node);
    const [left,right] = getSidesOfPoint(point)
  }

  findAlternativeIndex(container: Element, content: Node[]) {
    const newChildNodes = Array.from(container.childNodes).map(n => !content.includes(n)? n: undefined)
    const sliceStart = newChildNodes.indexOf(undefined)
    const validIndices = []
    for(let i = 0; i < newChildNodes.length; i++) {
      const contentToTest = [...newChildNodes]
      contentToTest.splice(i, 0, ...(content as ChildNode[]))
      contentToTest.splice(sliceStart, content.length)
      if(this.isContentValid(container, contentToTest as Node[])) {
        validIndices.push(i)
      }
    }
    return !validIndices.length? null: validIndices.sort(i => Math.abs(sliceStart - i)).at(0)!
  }

  getInvalidChildNodes(el: Element) {
    return Array.from(el.childNodes).filter(n => !this.isNodeValid(n))
  }

  fixInvalidContent(el: Element, invalidNodes=this.getInvalidChildNodes(el)) {
    if(this.isContentValid(el)) return;
    let newChildNodes = Array.from(el.childNodes) as (Node | Node[] | undefined)[]
    // For every invalid node, attempt: lift, wrap, move & wrap, delete
    for(const invalidNode of invalidNodes) {
      const i = newChildNodes.indexOf(invalidNode as Node)
      let wrapping, liftTarget, moveIndex
      if(wrapping = this.findWrapping(el, [invalidNode])) {
        wrapping.append(invalidNode)
        newChildNodes[i] = wrapping
        
      }
      else if(liftTarget=this.getLiftTarget(invalidNode)) {
        const [depth, replacement] = liftTarget
        let t = el; let i = 1
        while(i < depth && t.parentElement) {t = t.parentElement; i++}
        t.replaceWith(...replacement)
      }
      else if((moveIndex = this.findAlternativeIndex(el, [invalidNode])) !== null) {
        newChildNodes.splice(moveIndex, 0, invalidNode)
        newChildNodes.splice(i, 1)
      }
      else {
        newChildNodes[i] = undefined
      }
    }
    newChildNodes = newChildNodes.filter(n => n).flat()
    
    // For every still missing node, attempt: fill
    try {
      newChildNodes = this.fillByRule(el, undefined, newChildNodes as Node[])
    }
    catch(err) {
      console.error(err)
    }

    // If content is still invalid, remove el
    if(!this.isContentValid(el, newChildNodes as Node[])) {
      return el.remove()
    }
    else { // else apply the new subtree
      el.replaceChildren(...(newChildNodes as Node[]))
      el.normalize()
    }
  }

  checkAndCorrect(root: Node = document.documentElement, deep=false) {
    if(!(root instanceof Element)) return;
    this.fixInvalidContent(root)
    if(deep) root.childNodes.forEach(node => this.checkAndCorrect(node, true));
  }

  findValidTypesToInsert(range = $.range): string[] {
    let parent = range.startContainer && getContainer(range.startContainer)
    if(!parent) {
      return []
    }
    const allChildNodes = Array.from(parent!.childNodes)
    const index = getIndexBefore(range)
    const content = allChildNodes.slice(0, index)
    
    return this.findValidContentTypes(parent, undefined, content)
  }
}