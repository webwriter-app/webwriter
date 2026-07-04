import { baseSchema } from "./baseschema"
import { $, getContainer, getIndexBefore, getSidesOfPoint } from "./utility"

/** Defers to the parent's content rule ("transparent" content model, e.g. <a>, <ins>, <slot>), optionally restricted by an own selector. */
type ContentRuleTransparent = {
  transparent: true,
  selector?: string,
  min?: number,
  max?: number
}

/** Matches members of a named group (e.g. "flow", "phrasing"), optionally restricted by a selector. */
type ContentRuleGroup = {
  group: string,
  selector?: string,
  min?: number,
  max?: number
}

/** Matches elements by CSS selector, or text/comment nodes by type. */
type ContentRuleSelector = {
  selector: string | {type: "text"} | {type: "comment"},
  min?: number,
  max?: number
}

/** Matches the term rules in order (a sequence). */
type ContentRuleSequence = {
  terms: ContentRule[],
  min?: number,
  max?: number
}

/** Matches any one of the option rules (a choice). */
type ContentRuleChoice = {
  options: ContentRule[],
  min?: number,
  max?: number
}

/** Matches only nodes satisfying all condition rules (a conjunction). */
type ContentRuleConjunction = {
  conditions: ContentRule[],
  min?: number,
  max?: number
}

/** A node type's content model. Every rule kind takes `min`/`max` occurrence bounds, both defaulting to 1. Rules are matched statefully: validating a node against a rule decrements its bounds in place (see `Schema.isNodeValid`). */
type ContentRule = ContentRuleSelector | ContentRuleSequence | ContentRuleChoice | ContentRuleConjunction | ContentRuleTransparent | ContentRuleGroup

/** Describes a node type: its group memberships, content model and editing behavior (placeholders, separability, default node status, namespace). */
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

/** Defines which nodes are allowed where in the document — a content model like HTML's, expressed as `ContentRule`s per node type. Provides queries (canInsert, canReplace, canWrap, ...) and corrections (fixInvalidContent, fillByRule, ...) based on it. */
export class Schema {

  /** The default HTML schema. */
  static baseSchema: Record<string, SchemaEntry> = baseSchema as any
  #schema: Record<string, SchemaEntry> = {}
  #nodes: Record<string, Node> = {}
  #groups: Record<string, string[]> = {}

  /** Creates a schema from the given entries (defaults to the base schema). */
  constructor(baseSchema: Record<string, SchemaEntry> = Schema.baseSchema) {
    this.extend(baseSchema)
  }

  /** Adds or replaces schema entries and registers their group memberships. */
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

  /** Key of the type marked `defaultNode` (in the base schema "p"), falling back to "#text". Used wherever content is created without an explicit type. */
  get defaultNodeKey() {
    return Object.keys(this.#schema).find(k => this.#schema[k].defaultNode) ?? "#text"
  }

  /** Entry of the default node type. */
  get defaultNodeType() {
    return this.#schema[this.defaultNodeKey]
  }

  /** Returns the schema entry for a key or node. Elements resolve by tag name (`ns|tag` inside a namespace container), unknown elements to `#unknownelement`; throws for unsupported node types. */
  get(nodeOrKey: Node | string) {
    return nodeOrKey instanceof Node? this.#getTypeOfNode(nodeOrKey): this.#schema[nodeOrKey]
  }

  /** Creates a new node of the given type: `#text`, `#comment`, a namespaced `ns|tag` or a tag name. Defaults to the default node type. */
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

  /** Keys of types showing a placeholder when empty (those with an
   * emptySelector and a placeholder or empty style). */
  get placeholderKeys() {
    return Object.keys(this.#schema).filter(k => (this.#schema as any)[k].emptySelector && ((this.#schema as any)[k].placeholderStyle || (this.#schema as any)[k].emptyStyle))
  }

  /** The entries defining a content namespace for their descendants
   * (in the base schema `svg` and `math`). */
  get namespaceTypes(): SchemaEntry & {[k: string]: {contentNamespace: string}} {
    return Object.fromEntries(Object.entries(this.#schema)
      .filter(([,v]) => v.contentNamespace)) as any
  }

  /** The namespace URL the given type defines for its content. */
  getNamespaceURL(key: string) {
    return this.namespaceTypes[key].contentNamespace
  }

  /** Key of the closest ancestor establishing a content namespace (e.g. `svg`), or `undefined`. The element itself is not considered. */
  getNamespaceNameOfElement(node: Element) {
    const {namespaceTypes} = this
    while(node.parentElement) {
      node = node.parentElement
      const k = node.tagName.toLowerCase()
      if(k in namespaceTypes) return k
    }
  }

  /** Namespace URL established by the closest namespace container ancestor, or `undefined`. */
  getNamespaceOfElement(node: Element) {
    const {namespaceTypes} = this
    while(node.parentElement) {
      node = node.parentElement
      const nsType = namespaceTypes[node.tagName.toLowerCase()]
      if(nsType) return nsType.contentNamespace!
    }
  }

  /** Resolves a node to its schema entry (see `get()`). */
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

  /** Whether the type belongs to the "phrasing" group. */
  isPhrasing(nodeOrKey: Node | string) {
    return this.get(nodeOrKey).group?.includes("phrasing")
  }

  /** Whether the type can contain phrasing content. */
  isBlock(nodeOrKey: Node | string) {
    return !this.isPhrasing(nodeOrKey) && this.findValidContentTypes(nodeOrKey).includes("#text") && !this.get(nodeOrKey).headOnly
  }

  /** Returns a copy of the type keys in the given group. Throws for unknown groups. */
  getGroupMembers(key: string) {
    return Array.from(this.#groups[key] ?? [])
  }

  /** Whether `toReplace` could be swapped for `replacement` within its parent.
   * False for parentless nodes. */
  canReplace(toReplace: Node, replacement: Node) {
    const container = toReplace.parentElement
    if(!container) {
      return false
    }
    const childNodes = Array.from(container.childNodes)
    childNodes.splice(childNodes.indexOf(toReplace as ChildNode), 1, replacement as ChildNode)
    return this.isContentValid(container, childNodes)
  }

  /** Whether `insertee` may replace the container's children from `start` to `end` (or be inserted at `start` if `end` is omitted). */
  canInsert(container: Node, insertee: Node, start: number, end?: number) {
    const rule = this.#getTypeOfNode(container).content
    if(!rule) {
      return false
    }
    const childNodes = Array.from(container.childNodes)
    childNodes.splice(start, (end ?? start) - start, insertee as ChildNode)
    return this.isContentValid(container, childNodes)
  }

  /** Whether the node can be replaced with itself, a copy of itself, and optionally the insertee in between. */
  canSplit(node: Node, insertee?: Node) {
    const container = node.parentElement
    if(!container) return false;
    const siblings = Array.from(container.childNodes)
    const index = siblings.indexOf(node as ChildNode)
    const newSiblings = [
      ...siblings.slice(0, index),
      node,
      ...(insertee? [insertee]: []),
      node.cloneNode(),
      ...siblings.slice(index + 1)
    ]
    return this.isContentValid(container, newSiblings)
  }

  /** Whether the wrapper (type key or element) may contain `content`. */
  canWrap(wrapper: Element | string, content: Node[]) {
    const isText = typeof wrapper == "string" && wrapper.startsWith("#") || wrapper instanceof Text
    const isComment = typeof wrapper == "string" && wrapper.startsWith("#") || wrapper instanceof Comment
    return isText || isComment? false: this.isContentValid(wrapper, content)
  }

  /** Finds the nearest ancestor level `node` can be lifted to. Returns the depth (1 = grandparent) and the nodes replacing the sliced parent — the lifted node, preceded/followed by clones of the parent holding copies of its former left/right siblings. Null if no valid level exists or lifting would slice an inseperable parent. A pure query: the document is left unchanged. */
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
      const leftParent = leftChildren.length? parent.cloneNode() as Element: null; leftParent?.append(...leftChildren.map(n => n.cloneNode(true)))
      const rightParent = rightChildren.length? parent.cloneNode() as Element: null; rightParent?.append(...rightChildren.map(n => n.cloneNode(true)))
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

  

  /** Walks the tree below `root` and collects all nodes with invalid content. */
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

  /** The content rule of the node's type. */
  private getContentRule(nodeOrKey: Node | string, clone=true) {
    const rule = this.get(nodeOrKey).content
    return clone? structuredClone(rule): rule
  }

  /** Whether the (partially consumed) rule still requires more nodes. */
  private hasRuleRemainingMin(rule: ContentRule) {
    return (rule.min ?? 1) >= 1
  }

  /** Whether `content` (default: the node's current children) is valid for the node (given as node or type key). Each node is validated against a shared cloned rule (see isNodeValid), and the rule's minimum must be satisfied. Non-element nodes are always valid.. */
  isContentValid(node: Node | string, content?: Node[], rule=this.getContentRule(node)) {
    let nodeToCheck = typeof node === "string"? this.create(node): node
    
    if(!(nodeToCheck instanceof Element)) return true;
    if(!rule && (content ?? Array.from(nodeToCheck.childNodes)).length) return false
    else if(!rule && !content?.length) return true
    const contentToCheck = content ?? Array.from(nodeToCheck.childNodes)
    const everyNodeValid = contentToCheck.every(node => this.isNodeValid(node, rule))
    const hasRemainingMin = this.hasRuleRemainingMin(rule!)
    return everyNodeValid && !hasRemainingMin
  }

  /** Whether `node` is valid as the next piece of content under `rule`. Stateful: A successful match decrements the rule's min/max in place, so calling this repeatedly with the same rule object consumes it across a sequence of nodes — which is how isContentValid uses it. Elements with `contenteditable=false` are always valid. Throws for malformed rules. */
  isNodeValid(node: Node, rule=this.getContentRule(node.parentElement!)): boolean {
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
        rule.max = Math.max(0, (max ?? 1) - 1)
        return true
      } else return false
    }
    else if("transparent" in rule) {
      let current = node
      while(current.parentElement) {
        const parentRule = this.getContentRule(current.parentElement)
        if(!parentRule) {
          return false
        }
        else if("transparent" in parentRule) {
          current = current.parentElement!
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

  /** Returns content fulfilling the rule: keeps the valid nodes of `content` and creates any missing required nodes. Returns `content` unchanged if it is already valid. Throws if the container allows no content or leftover content cannot be placed. */
  fillByRule(
    containerOrKey: Node | string,
    rule=this.getContentRule(containerOrKey), 
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

  /** Lists the type keys currently insertable into the container under the rule, respecting already consumed min/max bonds. Transparent rules resolve against the container's parent; non-element containers yield no types. */
  findValidContentTypes(
    containerOrKey: Node | string,
    rule=this.getContentRule(containerOrKey), 
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

  /** Whether the node matches a selector rule: CSS selector for elements, node type for {type: "text"|"comment"}. */
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

  /** Finds a type valid in `container` (after the content preceding the
   * wrapped nodes) that can wrap `content`, and returns a new element of it.
   * Currently this can return a Text node ("#text" is never excluded from the
   * wrapper candidates, and any content "fits" into a non-element). */
  findWrapping(container: Element, content: Node[]): Element | undefined {
    const index = Array.from(container.childNodes).indexOf(content[0] as ChildNode)
    const slice = Array.from(container.childNodes).slice(0, index)
    const validContentTypes = this.findValidContentTypes(container, undefined, slice)
    const wrapperType = validContentTypes.find(k => this.canWrap(k, content))
    return wrapperType? this.create(wrapperType) as HTMLElement: undefined
  }

  /** Finds the index closest to the content's current position where it could be moved to make the container valid, or null if none exists. */
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

  /** The element's children that are invalid at their position. */
  getInvalidChildNodes(el: Element) {
    return Array.from(el.childNodes).filter(n => !this.isNodeValid(n))
  }

  /** Makes the element's content valid: for each invalid child it attempts to wrap it, lift it, move it to a valid position or delete it, then fills any missing required content. If the content still cannot be made valid, the element itself is removed. */
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

  /** Fixes the root element's content (see fixInvalidContent), and with `deep` all descendants too. Non-element roots are ignored. */
  checkAndCorrect(root: Node = document.documentElement, deep=false) {
    if(!(root instanceof Element)) return;
    this.fixInvalidContent(root)
    if(deep) root.childNodes.forEach(node => this.checkAndCorrect(node, true));
  }

  /** Lists the type keys insertable at the given range (default: the current selection), considering the content before it. */
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