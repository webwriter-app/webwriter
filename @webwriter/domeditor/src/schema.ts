import { baseSchema, baseSchemaMathML, baseSchemaSVG } from "./baseschema"
import { $, getContainer, getIndexBefore, getSidesOfPoint } from "./utility"

/** Defers to the parent's content rule ("transparent" content model, e.g. <a>, <ins>, <slot>), optionally restricted by an own selector. */
export type ContentRuleTransparent = {
  transparent: true,
  selector?: string,
  min?: number,
  max?: number
}

/** Matches members of a named group (e.g. "flow", "phrasing"), optionally restricted by a selector. */
export type ContentRuleGroup = {
  group: string,
  selector?: string,
  min?: number,
  max?: number
}

/** Matches elements by CSS selector, or text/comment nodes by type. */
export type ContentRuleSelector = {
  selector: string | {type: "text"} | {type: "comment"},
  min?: number,
  max?: number
}

/** Matches the term rules in order (a sequence). */
export type ContentRuleSequence = {
  terms: ContentRule[],
  min?: number,
  max?: number
}

/** Matches any one of the option rules (a choice). */
export type ContentRuleChoice = {
  options: ContentRule[],
  min?: number,
  max?: number
}

/** Matches only nodes satisfying all condition rules (a conjunction). */
export type ContentRuleConjunction = {
  conditions: ContentRule[],
  min?: number,
  max?: number
}

/** A node type's content model. Native rules take `min`/`max` occurrence
 * bounds, both defaulting to 1. Rules are matched statefully as child nodes
 * are validated (see `Schema.isNodeValid`). */
export type ContentExpression =
  | {kind: "empty"}
  | {kind: "reference", name: string, reference: "node" | "group"}
  | {kind: "sequence", terms: ContentExpression[]}
  | {kind: "choice", options: ContentExpression[]}
  | {kind: "star", expression: ContentExpression}

/** A compiled widget content expression. `current` is the residual expression
 * while a sequence of child nodes is being validated. */
export type ContentRuleExpression = {
  expression: ContentExpression
  source: string
  current?: ContentExpression
}

export type ContentRule = ContentRuleSelector | ContentRuleSequence | ContentRuleChoice | ContentRuleConjunction | ContentRuleTransparent | ContentRuleGroup | ContentRuleExpression

/** Describes a node type: its group memberships, content model and editing behavior (placeholders, separability, default node status, namespace). */
export type SchemaEntry = {
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

/** The editing-config fields that affect a widget's document-schema entry. */
export type WidgetEditingConfig = {
  group?: string
  inline?: boolean
  isolating?: boolean
  content?: string
}

export type WidgetSchemaDefinition = {
  tagName: string
  editingConfig?: WidgetEditingConfig
}

const emptyExpression = (): ContentExpression => ({kind: "empty"})

function expressionKey(expression: ContentExpression) {
  return JSON.stringify(expression)
}

function sequenceExpression(terms: ContentExpression[]): ContentExpression {
  const flattened = terms.flatMap(term => term.kind === "sequence" ? term.terms : [term])
    .filter(term => term.kind !== "empty")
  if(flattened.length === 0) return emptyExpression()
  if(flattened.length === 1) return flattened[0]
  return {kind: "sequence", terms: flattened}
}

function choiceExpression(options: ContentExpression[]): ContentExpression {
  const flattened = options.flatMap(option => option.kind === "choice" ? option.options : [option])
  const unique = [...new Map(flattened.map(option => [expressionKey(option), option])).values()]
  if(unique.length === 1) return unique[0]
  return {kind: "choice", options: unique}
}

function optionalExpression(expression: ContentExpression) {
  return choiceExpression([emptyExpression(), expression])
}

function repeatExpression(expression: ContentExpression, min: number, max: number): ContentExpression {
  if(!Number.isSafeInteger(min) || min < 0 || max < min || max > 1000 && max !== Infinity) {
    throw new SyntaxError(`Invalid content-expression range {${min},${max === Infinity ? "" : max}}`)
  }
  const terms = Array.from({length: min}, () => expression)
  if(max === Infinity) terms.push({kind: "star", expression})
  else terms.push(...Array.from({length: max - min}, () => optionalExpression(expression)))
  return sequenceExpression(terms)
}

class ContentExpressionParser {
  readonly #tokens: string[]
  #index = 0

  constructor(
    readonly source: string,
    readonly resolveReference: (name: string) => "node" | "group" | undefined,
  ) {
    this.#tokens = this.#tokenize(source)
  }

  parse(): ContentExpression {
    if(this.#tokens.length === 0) return emptyExpression()
    const expression = this.#parseChoice()
    if(this.#peek() !== undefined) this.#error(`Unexpected token '${this.#peek()}'`)
    return expression
  }

  #tokenize(source: string) {
    const tokens: string[] = []
    let index = 0
    while(index < source.length) {
      if(/\s/.test(source[index])) {
        index++
        continue
      }
      if("()|*+?{},".includes(source[index])) {
        tokens.push(source[index++])
        continue
      }
      const start = index
      while(index < source.length && !/\s/.test(source[index]) && !"()|*+?{},".includes(source[index])) index++
      tokens.push(source.slice(start, index))
    }
    return tokens
  }

  #parseChoice(): ContentExpression {
    const options = [this.#parseSequence()]
    while(this.#peek() === "|") {
      this.#index++
      options.push(this.#parseSequence())
    }
    return choiceExpression(options)
  }

  #parseSequence(): ContentExpression {
    const terms: ContentExpression[] = []
    while(this.#peek() !== undefined && this.#peek() !== ")" && this.#peek() !== "|") {
      terms.push(this.#parseRepeat())
    }
    return sequenceExpression(terms)
  }

  #parseRepeat(): ContentExpression {
    const expression = this.#parseAtom()
    const quantifier = this.#peek()
    if(quantifier === "?") {
      this.#index++
      return optionalExpression(expression)
    }
    if(quantifier === "*") {
      this.#index++
      return {kind: "star", expression}
    }
    if(quantifier === "+") {
      this.#index++
      return repeatExpression(expression, 1, Infinity)
    }
    if(quantifier === "{") {
      this.#index++
      const min = this.#parseInteger("range minimum")
      let max = min
      if(this.#peek() === ",") {
        this.#index++
        max = this.#peek() === "}" ? Infinity : this.#parseInteger("range maximum")
      }
      this.#expect("}")
      return repeatExpression(expression, min, max)
    }
    return expression
  }

  #parseAtom(): ContentExpression {
    const token = this.#peek()
    if(token === "(") {
      this.#index++
      const expression = this.#parseChoice()
      this.#expect(")")
      return expression
    }
    if(token === undefined || ")|*+?{},".includes(token)) {
      this.#error(token === undefined ? "Unexpected end of expression" : `Unexpected token '${token}'`)
    }
    this.#index++
    const name = token === "text" ? "#text" : token
    const reference = this.resolveReference(name)
    if(!reference) this.#error(`Unknown node or group '${token}'`)
    return {kind: "reference", name, reference}
  }

  #parseInteger(label: string) {
    const token = this.#peek()
    if(token === undefined || !/^\d+$/.test(token)) this.#error(`Expected ${label}`)
    this.#index++
    return Number(token)
  }

  #expect(token: string) {
    if(this.#peek() !== token) this.#error(`Expected '${token}'`)
    this.#index++
  }

  #peek() {
    return this.#tokens[this.#index]
  }

  #error(message: string): never {
    throw new SyntaxError(`${message} in content expression '${this.source}'`)
  }
}

function expressionNullable(expression: ContentExpression): boolean {
  if(expression.kind === "empty") return true
  if(expression.kind === "reference") return false
  if(expression.kind === "star") return true
  if(expression.kind === "choice") return expression.options.some(expressionNullable)
  return expression.terms.every(expressionNullable)
}

function expressionDerivative(
  expression: ContentExpression,
  matches: (reference: Extract<ContentExpression, {kind: "reference"}>) => boolean,
): ContentExpression | null {
  if(expression.kind === "empty") return null
  if(expression.kind === "reference") return matches(expression) ? emptyExpression() : null
  if(expression.kind === "choice") {
    const derivatives = expression.options.flatMap(option => {
      const derivative = expressionDerivative(option, matches)
      return derivative ? [derivative] : []
    })
    return derivatives.length ? choiceExpression(derivatives) : null
  }
  if(expression.kind === "star") {
    const derivative = expressionDerivative(expression.expression, matches)
    return derivative ? sequenceExpression([derivative, expression]) : null
  }

  const derivatives: ContentExpression[] = []
  for(let index = 0; index < expression.terms.length; index++) {
    const term = expression.terms[index]
    const derivative = expressionDerivative(term, matches)
    if(derivative) derivatives.push(sequenceExpression([derivative, ...expression.terms.slice(index + 1)]))
    if(!expressionNullable(term)) break
  }
  return derivatives.length ? choiceExpression(derivatives) : null
}

function expressionFirstReferences(expression: ContentExpression): Array<Extract<ContentExpression, {kind: "reference"}>> {
  if(expression.kind === "empty") return []
  if(expression.kind === "reference") return [expression]
  if(expression.kind === "choice") return expression.options.flatMap(expressionFirstReferences)
  if(expression.kind === "star") return expressionFirstReferences(expression.expression)

  const references: Array<Extract<ContentExpression, {kind: "reference"}>> = []
  for(const term of expression.terms) {
    references.push(...expressionFirstReferences(term))
    if(!expressionNullable(term)) break
  }
  return references
}

/** Defines which nodes are allowed where in the document — a content model like HTML's, expressed as `ContentRule`s per node type. Provides queries (canInsert, canReplace, canWrap, ...) and corrections (fixInvalidContent, fillByRule, ...) based on it. */
export class Schema {

  /** The complete default HTML, SVG and MathML schema. */
  static baseSchema: Record<string, SchemaEntry> = {
    ...baseSchema,
    ...baseSchemaSVG,
    ...baseSchemaMathML,
  } as unknown as Record<string, SchemaEntry>
  #schema: Record<string, SchemaEntry> = {}
  #nodes: Record<string, Node> = {}
  #groups: Record<string, string[]> = {}
  #createdTypes = new WeakMap<Node, string>()

  /** Creates a schema from the given entries (defaults to the base schema). */
  constructor(baseSchema: Record<string, SchemaEntry> = Schema.baseSchema) {
    this.extend(baseSchema)
  }

  /** Adds or replaces schema entries and registers their group memberships. */
  extend(extensionSchema: Record<string, SchemaEntry>) {
    Object.keys(extensionSchema).forEach(key => {
      this.#schema[key]?.group?.forEach(group => {
        this.#groups[group] = (this.#groups[group] ?? []).filter(member => member !== key)
      })
    })
    this.#schema = {...this.#schema, ...extensionSchema}
    Object.keys(extensionSchema).forEach(key => {
      if(key === "#unknownelement") delete this.#nodes[key]
      else this.#nodes[key] = this.create(key)
    })
    Object.keys(extensionSchema)
      .forEach(key => this.#schema[key].group?.forEach(group => {
        if(!this.#groups[group]?.includes(key)) {
          this.#groups[group] = [...(this.#groups[group] ?? []), key]
        }
      }))
  }

  /** Extends the schema with installed widget definitions. Widget content uses
   * the ProseMirror-style expressions published in package `editingConfig`
   * (node/group choices, sequences, parentheses and repetition operators). */
  extendWidgets(widgets: Iterable<WidgetSchemaDefinition>) {
    const definitions = [...widgets].map(({tagName, editingConfig = {}}) => ({
      tagName: tagName.toLowerCase(),
      editingConfig,
    }))
    const nodeNames = new Set([...Object.keys(this.#schema), ...definitions.map(({tagName}) => tagName)])
    const groupNames = new Set(Object.keys(this.#groups))
    definitions.forEach(({editingConfig}) => {
      if(typeof editingConfig.group === "string") {
        editingConfig.group.split(/\s+/).filter(Boolean).forEach(group => groupNames.add(group))
      }
    })
    groupNames.add("widget")
    groupNames.add("widgetinline")

    const extension = Object.fromEntries(definitions.map(({tagName, editingConfig}) => {
      if(!tagName.includes("-")) throw new TypeError(`Invalid widget tag name '${tagName}'`)
      const hasExplicitGroup = typeof editingConfig.group === "string"
      const configuredGroups = hasExplicitGroup
        ? editingConfig.group!.split(/\s+/).filter(Boolean)
        : []
      const groups = new Set([
        ...configuredGroups,
        editingConfig.inline ? "widgetinline" : "widget",
      ])
      if(!hasExplicitGroup && !editingConfig.inline) groups.add("flow")

      let content: ContentRule | undefined
      if(typeof editingConfig.content === "string") {
        const parser = new ContentExpressionParser(editingConfig.content, name => {
          if(nodeNames.has(name)) return "node"
          if(groupNames.has(name)) return "group"
        })
        content = {
          expression: parser.parse(),
          source: editingConfig.content,
        }
      }
      return [tagName, {
        group: [...groups],
        ...(content ? {content} : {}),
        inseperable: editingConfig.isolating ?? true,
      } satisfies SchemaEntry]
    }))
    this.extend(extension)
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
    let node: Node
    if(key === "#text") {
      node = document.createTextNode("")
    }
    else if(key === "#comment") {
      node = document.createComment("")
    }
    else {
      const contentNamespace = this.#schema[key]?.contentNamespace
      node = key.includes("|")
        ? document.createElementNS(
          this.getNamespaceURL(key.split("|").at(0)!),
          key.split("|").at(1)!)
        : contentNamespace
          ? document.createElementNS(contentNamespace, key)
          : document.createElement(key)
    }
    this.#createdTypes.set(node, key)
    return node
  }

  /** Keys of types showing a placeholder when empty (those with an
   * emptySelector and a placeholder or empty style). */
  get placeholderKeys() {
    return Object.keys(this.#schema).filter(k => (this.#schema as any)[k].emptySelector && ((this.#schema as any)[k].placeholderStyle || (this.#schema as any)[k].emptyStyle))
  }

  /** The entries defining a content namespace for their descendants
   * (in the base schema `svg` and `math`). */
  get namespaceTypes(): Record<string, SchemaEntry & {contentNamespace: string}> {
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
    return this.#schema[this.#getTypeKey(node)]
  }

  /** Resolves a node to its schema key, including detached namespaced
   * elements whose namespace cannot be inferred from an ancestor. */
  #getTypeKey(node: Node) {
    const createdType = this.#createdTypes.get(node)
    if(createdType && createdType in this.#schema) return createdType
    if(node instanceof Element) {
      const localName = node.localName || node.tagName.toLowerCase()
      const ancestorNamespace = this.getNamespaceNameOfElement(node)
      const namespaceRoot = !ancestorNamespace
        ? Object.entries(this.namespaceTypes).find(([key, entry]) =>
          key.toLowerCase() === localName.toLowerCase()
          && entry.contentNamespace === node.namespaceURI,
        )?.[0]
        : undefined
      if(namespaceRoot) return namespaceRoot
      const namespaceFromURI = Object.entries(this.namespaceTypes)
        .find(([, entry]) => entry.contentNamespace === node.namespaceURI)?.[0]
      const namespace = namespaceFromURI
        ?? (node.namespaceURI ? undefined : this.getNamespaceNameOfElement(node))
      const customizedName = !namespace ? node.getAttribute("is")?.toLowerCase() : undefined
      const resolvedLocalName = customizedName && customizedName in this.#schema
        ? customizedName
        : localName
      const key = namespace
        ? Object.keys(this.#schema).find(key => key.startsWith(`${namespace}|`) && key.split("|")[1].toLowerCase() === resolvedLocalName.toLowerCase()) ?? `${namespace}|${resolvedLocalName}`
        : resolvedLocalName
      return key in this.#schema ? key : "#unknownelement"
    }
    else if(node.nodeType === Node.TEXT_NODE) {
      return "#text"
    }
    else if(node.nodeType === Node.COMMENT_NODE) {
      return "#comment"
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
    if("expression" in rule) {
      return !expressionNullable(rule.current ?? rule.expression)
    }
    return (rule.min ?? 1) >= 1
  }

  /** Whether a partially consumed rule can accept at least one more node. */
  private hasRuleRemainingMax(rule: ContentRule) {
    if("expression" in rule) {
      return expressionFirstReferences(rule.current ?? rule.expression).length > 0
    }
    return (rule.max ?? 1) > 0
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
    else if("expression" in rule) {
      const current = rule.current ?? rule.expression
      const derivative = expressionDerivative(current, reference => {
        const key = this.#getTypeKey(node)
        return reference.reference === "node"
          ? key === reference.name
          : key !== "#unknownelement" && this.getGroupMembers(reference.name).includes(key)
      })
      if(!derivative) return false
      rule.current = derivative
      return true
    }
    else if("options" in rule) {
      const {min, max, options} = rule
      if(options.length === 0) return false;
      const valid = (max ?? 1) > 0 && options.some(option => this.isNodeValid(node, structuredClone(option)))
      if(valid) {
        rule.min = Math.max(0, (rule.min ?? 1) - 1)
        rule.max = Math.max(0, (rule.max ?? 1) - 1)
        return true
      } else return false
    }
    else if("group" in rule) {
      const {min, max, group, selector} = rule
      const valid = (max ?? 1) > 0
        && this.#getTypeKey(node) !== "#unknownelement"
        && this.getGroupMembers(group).includes(this.#getTypeKey(node))
        && (!selector || this.testSelectorRule(node, selector))
      if(valid) {
        rule.min = Math.max(0, (rule.min ?? 1) - 1)
        rule.max = Math.max(0, (rule.max ?? 1) - 1)
        return true
      } else return false
    }
    else if("terms" in rule) {
      const {min, max, terms} = rule
      if(terms.length === 0) return false;
      if((max ?? 1) < 1) return false
      for(const term of terms) {
        if(!this.hasRuleRemainingMax(term)) continue
        const candidate = structuredClone(term)
        if(this.isNodeValid(node, candidate)) {
          Object.assign(term, candidate)
          if(terms.every(term => !this.hasRuleRemainingMin(term))) {
            rule.min = Math.max(0, (min ?? 1) - 1)
            rule.max = Math.max(0, (max ?? 1) - 1)
          }
          return true
        }
        if(this.hasRuleRemainingMin(term)) return false
      }
      return false
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
    content?: Node[]
  ): string[] {
    if(!rule || containerOrKey instanceof Node && !(containerOrKey instanceof Element)) {
      return []
    }

    const container = containerOrKey instanceof Node? containerOrKey: this.create(containerOrKey)
    if(content !== undefined) {
      rule = structuredClone(rule)
      if(!content.every(node => this.isNodeValid(node, rule))) return []
    }

    if("expression" in rule) {
      const references = expressionFirstReferences(rule.current ?? rule.expression)
      return Object.keys(this.#nodes).filter(key => references.some(reference =>
        reference.reference === "node"
          ? key === reference.name
          : this.getGroupMembers(reference.name).includes(key),
      ))
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
      const termRule = rule.terms.find(term => this.hasRuleRemainingMax(term))
      return termRule ? this.findValidContentTypes(container, termRule) : []
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
    else if(node instanceof Element && selector.includes("|")) {
      const [namespace, localName] = selector.split("|")
      const namespaceURL = this.namespaceTypes[namespace]?.contentNamespace
      const nodeLocalName = node.localName || node.tagName.toLowerCase()
      return (namespace === "*" || namespaceURL === node.namespaceURI)
        && (localName === "*" || localName.toLowerCase() === nodeLocalName.toLowerCase())
    }
    else if(node instanceof Element) {
      return node.namespaceURI === document.documentElement.namespaceURI && node.matches(selector)
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
    // For every consecutive invalid run, attempt: lift, wrap, move & wrap, delete
    for(let invalidNodeIndex = 0; invalidNodeIndex < invalidNodes.length;) {
      const invalidNode = invalidNodes[invalidNodeIndex]
      const invalidRun = [invalidNode]
      while(invalidNodes[invalidNodeIndex + invalidRun.length] === invalidRun.at(-1)!.nextSibling) {
        invalidRun.push(invalidNodes[invalidNodeIndex + invalidRun.length])
      }
      const i = newChildNodes.indexOf(invalidNode as Node)
      let wrapping, liftTarget, moveIndex
      if(wrapping = this.findWrapping(el, invalidRun)) {
        wrapping.append(...invalidRun)
        newChildNodes[i] = wrapping
        invalidRun.slice(1).forEach(node => newChildNodes[newChildNodes.indexOf(node)] = undefined)
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
      invalidNodeIndex += invalidRun.length
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
