export type WidgetResultType = "application/json" | "application/xml"
export type WidgetResult = {type: WidgetResultType, text: string}
export type StoredWidgetResult = WidgetResult & {revision: string}

export interface WidgetResultStorage {
  load(signal: AbortSignal): Promise<StoredWidgetResult | null>
  save(result: WidgetResult, revision: string | null, signal: AbortSignal): Promise<string>
}

export class WidgetResultConflict extends Error {
  constructor() { super("A newer result is already saved.") }
}

export function isWidgetResultType(type: unknown): type is WidgetResultType {
  return type === "application/json" || type === "application/xml"
}

export function validateWidgetResult(result: WidgetResult) {
  if(result.type === "application/json") {
    if(result.text.trim()) JSON.parse(result.text)
  }
  else {
    if(/<\/script[\s/>]/i.test(result.text)) throw new Error("XML results cannot contain a closing script tag.")
    const parsed = new DOMParser().parseFromString(result.text, "application/xml")
    if(parsed.getElementsByTagNameNS("http://www.mozilla.org/newlayout/xml/parsererror.xml", "parsererror").length) {
      throw new Error("The widget result must contain valid XML.")
    }
  }
}

export class BrowserWidgetResultStorage implements WidgetResultStorage {
  constructor(private storage: Storage, private key: string) {}

  async load(signal: AbortSignal) {
    signal.throwIfAborted()
    const revision = this.storage.getItem(this.key)
    if(revision === null) return null
    const result = JSON.parse(revision) as Partial<WidgetResult> | null
    if(!isWidgetResultType(result?.type) || typeof result.text !== "string") throw new Error("The browser result is invalid.")
    return {type: result.type, text: result.text, revision}
  }

  async save(result: WidgetResult, revision: string | null, signal: AbortSignal) {
    signal.throwIfAborted()
    if(this.storage.getItem(this.key) !== revision) throw new WidgetResultConflict()
    const next = JSON.stringify(result)
    this.storage.setItem(this.key, next)
    return next
  }
}

export function widgetResultEndpoint(input: string, base: string) {
  const url = new URL(input, base)
  if(!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Enter an HTTP or HTTPS endpoint without credentials or a fragment.")
  }
  return url
}

function strongETag(response: Response) {
  const value = response.headers.get("ETag")
  return value && /^"[!#-~\u0080-\u00ff]*"$/.test(value) ? value : null
}

export class HttpWidgetResultStorage implements WidgetResultStorage {
  private readonly endpoint: URL

  constructor(endpoint: URL, private request: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.endpoint = widgetResultEndpoint(endpoint.href, endpoint.href)
  }

  private fetch(init: RequestInit, signal: AbortSignal) {
    return this.request(this.endpoint.href, {
      ...init, cache: "no-store", credentials: "same-origin", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    })
  }

  async load(signal: AbortSignal) {
    const response = await this.fetch({method: "GET", headers: {Accept: "application/json, application/xml"}}, signal)
    if(response.status === 404) return null
    if(response.status !== 200) throw new Error(`Could not load the remote result (HTTP ${response.status}).`)
    const type = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase()
    if(!isWidgetResultType(type)) throw new Error("The endpoint must return a JSON or XML result.")
    const revision = strongETag(response)
    if(!revision) throw new Error("The endpoint must return a strong ETag.")
    return {type, text: await response.text(), revision}
  }

  async save(result: WidgetResult, revision: string | null, signal: AbortSignal) {
    const response = await this.fetch({
      method: "PUT",
      headers: {"Content-Type": result.type, ...(revision === null ? {"If-None-Match": "*"} : {"If-Match": revision})},
      body: result.text,
    }, signal)
    if(response.status === 412) throw new WidgetResultConflict()
    if(![200, 201, 204].includes(response.status)) throw new Error(`Could not save the remote result (HTTP ${response.status}).`)
    const next = strongETag(response)
    if(next) return next
    const stored = await this.load(signal)
    if(stored?.type === result.type && stored.text === result.text) return stored.revision
    throw new WidgetResultConflict()
  }
}

/** A unique authored ID survives reordering. Idless embeds use their DOM position. */
export function widgetResultKey(widget: Element) {
  const path: string[] = []
  for(let node: Element | null = widget; node;) {
    const root = node.getRootNode() as Document | ShadowRoot
    if(node.id && Array.from(root.querySelectorAll("[id]")).filter(element => element.id === node!.id).length === 1) {
      path.unshift(`#${node.id}`)
    }
    else {
      const siblings = node.parentNode?.children
      path.unshift(`${node.localName}:${siblings ? Array.from(siblings).indexOf(node) : 0}`)
    }
    if(node.parentElement && !path[0].startsWith("#")) node = node.parentElement
    else node = "host" in root ? root.host : null
  }
  const {origin, pathname, search} = new URL(widget.ownerDocument.URL)
  return `webwriter:widget-result:${JSON.stringify([origin, pathname, search, path])}`
}
