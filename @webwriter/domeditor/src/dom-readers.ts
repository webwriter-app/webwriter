/** The read operations shared by native DOM elements and views of the Yjs
 * mirror. Views never own content or write back to the authored document. */
export interface ReadableNode {
  readonly nodeType: number
  readonly textContent: string | null
  readonly parentElement: ReadableElement | null
}

export interface ReadableElement extends ReadableNode {
  readonly localName: string
  readonly namespaceURI: string | null
  readonly id: string
  readonly children: ArrayLike<ReadableElement>
  readonly childNodes: ArrayLike<ReadableNode>
  readonly attributes: ArrayLike<{name: string, value: string, namespaceURI: string | null}>
  readonly ownerDocument: {readonly body: ReadableElement, readonly documentElement: ReadableElement}
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
}

export function hasClass(element: ReadableElement, name: string) {
  const tokens = (element as ReadableElement & {classList?: DOMTokenList}).classList
  if(tokens) return tokens.contains(name)
  const value = Array.from(element.attributes).find(attr => attr.namespaceURI === null && attr.name === "class")?.value
  return value?.split(/[\t\n\f\r ]+/).includes(name) ?? false
}

export function* descendantElements<T extends ReadableElement>(root: T): Generator<T> {
  for(const child of Array.from(root.children) as T[]) {
    yield child
    yield* descendantElements(child)
  }
}

export function closestElement<T extends ReadableElement>(element: T | null, predicate: (element: T) => boolean, selector?: string): T | null {
  const closest = (element as (T & {closest?: Element["closest"]}) | null)?.closest
  if(selector && closest) return closest.call(element, selector) as T | null
  for(let current = element; current; current = current.parentElement as T | null) if(predicate(current)) return current
  return null
}

export function containsElement(root: ReadableElement, element: ReadableNode): boolean {
  const native = root as ReadableElement & {contains?: Node["contains"]}
  if(native.contains && typeof (element as Node).getRootNode === "function") return native.contains(element as Node)
  return root === element || Boolean(closestElement(element.parentElement, parent => parent === root))
}

export function elementById<T extends ReadableElement>(element: T, id: string): T | null {
  const doc = element.ownerDocument as ReadableElement["ownerDocument"] & {getElementById?: Document["getElementById"]}
  if(doc.getElementById) return doc.getElementById(id) as T | null
  const root = element.ownerDocument.documentElement as T
  return root.id === id ? root : [...descendantElements(root)].find(candidate => candidate.id === id) ?? null
}

export function readableNodePath(root: ReadableElement, node: ReadableNode): number[] | null {
  const path: number[] = []
  let current = node
  while(current !== root) {
    const parent = current.parentElement
    if(!parent) return null
    const index = Array.from(parent.childNodes).indexOf(current)
    if(index < 0) return null
    path.unshift(index)
    current = parent
  }
  return path
}
