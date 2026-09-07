import {Node, PropertySymbol} from "happy-dom"

// Happy DOM 20.8.3 stores MutationObserver delivery callbacks only through an
// unretained WeakRef. Keep each registered callback alive for the lifetime of
// its mutation listener in tests; the WeakMap key still releases it with the
// listener. This is test-runtime compatibility code and does not affect the
// browser build.
const marker = Symbol.for("webwriter.happy-dom.observe-mutations-patched")
if(!Node.prototype[marker]) {
  const observeMutations = Node.prototype[PropertySymbol.observeMutations]
  const retainedCallbacks = new WeakMap()
  const patchedObserveMutations = function(listener) {
    const callback = listener?.callback?.deref?.()
    if(callback) retainedCallbacks.set(listener, callback)
    return observeMutations.call(this, listener)
  }
  Node.prototype[PropertySymbol.observeMutations] = patchedObserveMutations
  Node.prototype[marker] = true
}
