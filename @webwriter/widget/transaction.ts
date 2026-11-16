/** `detail` of the `ww-transactionend` that a former ancestor sends for a host that left the document. */
export type TransactionEndDetail = {host: Element}

type Open = {
  depth: number
  /** The host's ancestors at the start, through shadow roots, nearest first. */
  path: Node[]
  watch?: MutationObserver
}

const open = new WeakMap<Element, Open>()

function send(target: EventTarget, type: "ww-transactionstart" | "ww-transactionend", detail?: TransactionEndDetail) {
  target.dispatchEvent(new CustomEvent(type, {bubbles: true, composed: true, detail}))
}

function ancestors(host: Element): Node[] {
  const path: Node[] = []
  for(let node: Node | null = host; node; ) {
    node = node instanceof ShadowRoot ? node.host : node.parentNode
    if(node) path.push(node)
  }
  return path
}

/**
 * Ends the transaction once. The event of a host that left the document reaches
 * only listeners on the host itself, so the place it was attached to sends one too.
 */
function close(host: Element, state: Open) {
  if(open.get(host) !== state) return
  open.delete(host)
  state.watch?.disconnect()
  const former = host.isConnected ? undefined : state.path.find(node => node.isConnected)
  send(host, "ww-transactionend")
  if(former) send(former, "ww-transactionend", {host})
}

/** Ends a transaction that is waiting for a promise as soon as its host leaves the document. */
function watch(host: Element, state: Open) {
  if(state.watch || !host.isConnected) return
  state.watch = new MutationObserver(() => {
    if(!host.isConnected) close(host, state)
  })
  for(const node of state.path) {
    if(node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) state.watch.observe(node, {childList: true, subtree: true})
  }
}

/** True while a `transaction()` of this host is open, also between a change and the promise it returned. */
export function transactionOpen(host: Element): boolean {
  return open.has(host)
}

/**
 * Runs `change` as one undo step: `ww-transactionstart` is dispatched on the
 * host before it and `ww-transactionend` after it, also when it throws. If
 * `change` returns a promise, the transaction ends when the promise settles.
 * Nested calls for the same host send only the outermost pair.
 *
 * If the host leaves the document while the transaction is open, the
 * transaction ends at once. The host's own end event no longer reaches the
 * document, so a second one is sent from the nearest former ancestor that is
 * still connected, with `detail.host`: whoever counts the pairs there stays
 * balanced. A host that is moved (removed and inserted again in the same
 * task) stays open.
 */
export function transaction<T>(host: Element, change: () => T): T {
  let state = open.get(host)
  if(state) state.depth++
  else {
    state = {depth: 1, path: ancestors(host)}
    open.set(host, state)
    send(host, "ww-transactionstart")
  }
  const current = state
  const end = () => {
    if(--current.depth === 0) close(host, current)
  }
  let result: T
  try {
    result = change()
  } catch(error) {
    end()
    throw error
  }
  if(result instanceof Promise) {
    watch(host, current)
    return result.finally(end) as T
  }
  end()
  return result
}
