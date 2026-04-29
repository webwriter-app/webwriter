import { baseSchema } from "./baseschema"
import { $, getContainer, getIndexBefore } from "./utility"

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
  defaultNode?: boolean
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
      .filter(k => k !== "#unknowncustomelement")
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
      return document.createElement(key)
    }
  }

  get placeholderKeys() {
    return Object.keys(this.#schema).filter(k => (this.#schema as any)[k].emptySelector && ((this.#schema as any)[k].placeholderStyle || (this.#schema as any)[k].emptyStyle))
  }

  #getTypeOfNode(node: Node) {
    if(node instanceof Element && node.tagName.toLowerCase() in this.#schema) {
      return this.#schema[node.tagName.toLowerCase()]
    }
    else if(node instanceof Element && !(node.tagName in this.#schema)) {
      return this.#schema["#unknowncustomelement"]
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
      ...childNodes.slice(0, index),
      ...(!insertee? []: [container.cloneNode()]),
      container.cloneNode(),
      ...childNodes.slice(index + 1)
    ]
    return this.isContentValid(container, newChildNodes)
  }

  canWrap(wrapper: Element | string, content: Node[]) {
    return this.isContentValid(wrapper, content)
  }

  canLift(container: Element, node: Node) {
    const content = Array.from(container.childNodes)
    const i = content.indexOf(node as ChildNode)
    content.splice(i, 1, ...Array.from(node.childNodes))
    return this.isContentValid(container, content)
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
    if("group" in rule) {
      return (rule.min ?? 1) < 1
    }
    else if("options" in rule) {
      return rule.options.every(option => (option.min ?? 1) >= 1)
    }
    else if("terms" in rule) {
      return rule.terms.some(term => (term.min ?? 1) < 1)
    }
    else if("selector" in rule) {
      return (rule.min ?? 1) < 1
    }
    else {
      throw TypeError(`Invalid rule '${JSON.stringify(rule)}'`)
    }
  }

  isContentValid(node: Node | string, content?: Node[], rule=structuredClone(this.getContentRule(node))) {
    let nodeToCheck = typeof node === "string"? this.create(node): node
    
    if(!(nodeToCheck instanceof Element)) {
      return true
    }
    if(!rule) {
      return false
    }
    const contentToCheck = content ?? Array.from(nodeToCheck.childNodes)
    const everyNodeValid = contentToCheck.every(node => this.isNodeValid(node, rule))
    const hasRemainingMin = this.hasRuleRemainingMin(rule)
    return everyNodeValid && hasRemainingMin
  }

  isNodeValid(node: Node, rule=structuredClone(this.getContentRule(node))): boolean {
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

  findValidContentTypes(
    containerOrKey: Node | string,
    rule=structuredClone(this.getContentRule(containerOrKey)), 
    content=containerOrKey instanceof Node? Array.from(containerOrKey.childNodes): []
  ): string[] {
    if(!rule || containerOrKey instanceof Node && !(containerOrKey instanceof Element)) {
      return []
    }

    const container = containerOrKey instanceof Node? containerOrKey: document.createElement(containerOrKey)

    const isValid = this.isContentValid(container, content, rule)
    if(!isValid) {
      throw TypeError("Content is invalid")
    }
    else if((rule.max ?? 1) < 1) {
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
    const wrapperType = validContentTypes.find(k => this.canWrap(k, content))
    return wrapperType? this.create(wrapperType) as HTMLElement: undefined
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

  getMissingChildTypes(el: Element): string[] {
    return []
  }

  fixInvalidContent(el: Element, invalidNodes=this.getInvalidChildNodes(el), missingTypes=this.getMissingChildTypes(el)) {
    let newChildNodes = Array.from(el.childNodes) as (Node | Node[] | undefined)[]
    // For every invalid node, attempt: lift, wrap, move & wrap, delete
    for(const invalidNode of invalidNodes) {
      const i = newChildNodes.indexOf(invalidNode as Node)
      let wrapping, moveIndex
      if(this.canLift(el, invalidNode)) {
        newChildNodes[i] = Array.from(invalidNode.childNodes)
      }
      else if(wrapping = this.findWrapping(el, [invalidNode])) {
        newChildNodes[i] = wrapping
      }
      else if((moveIndex = this.findAlternativeIndex(el, [invalidNode])) !== null) {
        newChildNodes.splice(moveIndex, 0, invalidNode)
        newChildNodes.splice(i, 1)
      }
      else {
        newChildNodes[i] = undefined
      }
    }
    // For every missing node, attempt: fill

    newChildNodes = newChildNodes.filter(n => n).flat()

    // If content is still invalid, remove el
    if(!this.isContentValid(el, newChildNodes as Node[])) {
      return el.remove()
    }
    else {
      el.replaceChildren(...(newChildNodes as Node[]))
      el.normalize()
    }
  }

  checkAndCorrect(root: Node = document) {
    this.findInvalidNodes(root).forEach(node => this.fixInvalidContent(node as any))
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