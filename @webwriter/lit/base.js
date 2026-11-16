class CoreController {
  constructor(host, create) {
    this.host = host;
    this.core = create(() => host.renderRoot);
    host.addController(this);
  }
  core;
  #unsubscribe = null;
  /** The core's current state. */
  get snapshot() {
    return this.core.getSnapshot();
  }
  /**
   * Asked after every state change of the core: whether the host renders
   * again. Default: always. Override it to skip changes that no template
   * shows, such as a scroll position the browser applies itself.
   */
  shouldRender() {
    return true;
  }
  hostConnected() {
    this.#unsubscribe ??= this.core.subscribe(() => {
      if (this.shouldRender()) this.host.requestUpdate();
    });
    this.core.connect();
  }
  hostDisconnected() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.core.disconnect();
  }
  hostUpdated() {
    this.core.refresh();
  }
}
export {
  CoreController
};
