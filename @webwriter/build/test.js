export const getMochaConfig = () => ({
    ui: "bdd",
    rootHooks: {
      beforeAll: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "beforeAll",
        }}))
        done()
      },
      beforeEach: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "beforeOne",
          id: this.currentTest.id,
          path: this.currentTest.titlePath(),
          sync: this.currentTest.sync
        }}))
        done()
      },
      afterEach: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "afterOne",
          id: this.currentTest.id,
          path: this.currentTest.titlePath(),
          passed: this.currentTest.isPassed(),
          duration: this.currentTest.duration,
          sync: this.currentTest.sync,
          timedOut: this.currentTest.timedOut
        }}))
        done()
      },
      afterAll: function(done) {
        window.dispatchEvent(new CustomEvent("test-update", {bubbles: true, detail: {
          type: "afterAll",
        }}))
        done()
      },
    },
    reporter: "min"
})

/**
 * Connect an effect of a widget to a source for the length of a test, the way
 * the editor does for an authored link. Create the source with `signal` or
 * `computed` from `@webwriter/widget/signals`, or from `@webwriter/lit`, so
 * that the source and the widget share one Signals implementation.
 *
 * Looks the effect up in the widget's `effects` (instance first, then
 * the class). Throws when the widget has no such effect, or when `shape` is
 * given and the effect lists `accepts` without it, which is where the editor
 * would leave the link unconnected.
 *
 * @param {HTMLElement} widget The receiving widget.
 * @param {string} attribute The effect attribute, such as `"data-from"`.
 * @param {{get(): unknown}} source The signal to connect.
 * @param {{shape?: string}} [options] The declared shape of the source.
 * @returns {{lifetime: AbortSignal, disconnect(): void}} `disconnect()` aborts the lifetime like the editor does when the link ends. It is safe to call twice.
 */
export function connectEffect(widget, attribute, source, options = {}) {
  const effect = (widget.effects ?? widget.constructor.effects)?.[attribute]
  if(typeof effect?.connect !== "function") throw new Error(`<${widget.localName}> declares no effect "${attribute}"`)
  const {shape} = options
  if(shape !== undefined && Array.isArray(effect.accepts) && effect.accepts.length && !effect.accepts.includes(shape)) {
    throw new Error(`Effect "${attribute}" of <${widget.localName}> accepts ${effect.accepts.join(", ")}, not ${shape}`)
  }
  const controller = new AbortController()
  effect.connect.call(widget, source, controller.signal)
  return {lifetime: controller.signal, disconnect: () => controller.abort()}
}
