// index.ts
import { LitElement, adoptStyles } from "lit";
var javaScriptMimeTypes = /* @__PURE__ */ new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript"
]);
function isDataBlockType(type) {
  const essence = type.split(";")[0].trim().toLowerCase();
  return /^[^\s/]+\/[^\s/]+$/.test(essence) && !javaScriptMimeTypes.has(essence);
}
var contextFollowers = /* @__PURE__ */ new WeakMap();
var registries = /* @__PURE__ */ new WeakMap();
var LitElementWw = class extends LitElement {
  static scopedElements = {};
  static options = {};
  static actions = {};
  static dataType = void 0;
  localize;
  /** One native registry per concrete widget class, shared by its instances. */
  get registry() {
    const constructor = this.constructor;
    let registry = registries.get(constructor);
    if (!registry) {
      registry = new CustomElementRegistry();
      for (const [name, element] of Object.entries(constructor.scopedElements)) registry.define(name, element);
      registries.set(constructor, registry);
    }
    return registry;
  }
  createRenderRoot() {
    const constructor = this.constructor;
    const registry = this.registry;
    const root = this.shadowRoot ?? this.attachShadow({ ...constructor.shadowRootOptions, customElementRegistry: registry });
    adoptStyles(root, constructor.elementStyles);
    this.renderOptions.renderBefore ??= root.firstChild;
    const customElementRegistry = root.customElementRegistry;
    this.renderOptions.creationScope = {
      importNode: (node, deep) => this.ownerDocument.importNode(node, { customElementRegistry, selfOnly: !deep })
    };
    return root;
  }
  get editable() {
    return this.isContentEditable;
  }
  /** Includes explicit lang="", which stops inheritance. Inherited values are
   * never reflected onto the widget. Setting null removes an authored value. */
  get lang() {
    return this.closest("[lang]")?.getAttribute("lang") ?? "";
  }
  set lang(value) {
    if (value === null || value === void 0) this.removeAttribute("lang");
    else this.setAttribute("lang", value);
  }
  static get observedAttributes() {
    return [.../* @__PURE__ */ new Set([...super.observedAttributes, "contenteditable", "lang", "shared", "id"])];
  }
  attributeChangedCallback(name, oldValue, value) {
    super.attributeChangedCallback(name, oldValue, value);
    if (oldValue === value) return;
    if (name === "lang" || name === "contenteditable") this.#contextChanged();
    if (name === "shared" || name === "id") {
      this.#readyBlock = null;
      if (this.isConnected) this.#syncData();
    }
  }
  #observedDocument;
  #language;
  #editable;
  #contextChanged = () => {
    const language = this.lang, editable = this.editable;
    if (language !== this.#language) {
      const before = this.#language;
      this.#language = language;
      this.requestUpdate("lang", before);
      if (this.isConnected && this.localize) {
        const failed = (error) => {
          this.dispatchEvent(new CustomEvent("localizationerror", { detail: { error } }));
          this.requestUpdate();
        };
        try {
          void Promise.resolve(this.localize.setLocale(language)).then(() => this.requestUpdate(), failed);
        } catch (error) {
          failed(error);
        }
      }
    }
    if (editable !== this.#editable) {
      const before = this.#editable;
      this.#editable = editable;
      this.requestUpdate("editable", before);
    }
  };
  /** Retained for widgets that explicitly request an inherited-language refresh. */
  languageChanged() {
    this.#contextChanged();
  }
  #dataContainer() {
    const blocks = Array.from(this.children).filter((child) => child.namespaceURI === "http://www.w3.org/1999/xhtml" && child.localName === "script" && isDataBlockType(child.type) && !child.hasAttribute("src"));
    return blocks.find((block) => this.#scoped(block)) ?? blocks[0] ?? null;
  }
  #scoped(block) {
    return !!block && block.getAttribute("slot") === "data" && ["application/json", "application/xml"].includes(block.type);
  }
  #scope() {
    return JSON.stringify([
      this.ownerDocument.documentElement.id,
      this.id,
      this.getAttribute("shared"),
      ...Array.from(this.childNodes).filter((node) => node.nodeType === 7 && node.nodeName === "ww-grouping").map((node) => node.nodeValue)
    ]);
  }
  get data() {
    return this.#dataContainer()?.textContent ?? null;
  }
  set data(value) {
    this.setData(this.dataType ?? "text/plain", value ?? "");
  }
  get dataType() {
    return this.#dataContainer()?.type ?? this.constructor.dataType;
  }
  #block;
  #bindingScope;
  #readyBlock = null;
  #readyScope;
  #managed = false;
  #lastText;
  #mode = "local";
  #syncing = false;
  #contentObserver = new MutationObserver(() => this.#syncData());
  /** False while the current participant scope is loading or unavailable. */
  get dataReady() {
    const block = this.#dataContainer();
    return this.isConnected && (!this.#scoped(block) || block === this.#block && this.#bindingScope === this.#scope() && (!this.#managed || block === this.#readyBlock && this.#readyScope === this.#scope()));
  }
  /** Implement these hooks to update the widget's presentation. Do not write
   * snapshots back from a notification; write in response to user interactions. */
  dataPending(context) {
  }
  dataChanged(value, context) {
  }
  dataError(error, context) {
  }
  #context(block = this.#dataContainer()) {
    return { block, mode: this.#mode };
  }
  #syncData() {
    if (!this.isConnected || this.#syncing) return;
    this.#syncing = true;
    try {
      const block = this.#dataContainer(), scope = this.#scope();
      if (block !== this.#block || scope !== this.#bindingScope) {
        this.#block = block;
        this.#bindingScope = scope;
        this.#readyBlock = null;
        this.#managed = false;
        this.#mode = "local";
        if (this.#scoped(block)) {
          const Request = this.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
          const request = new Request("datarequest", { bubbles: true, cancelable: true });
          this.#managed = !block.dispatchEvent(request);
        }
        if (!this.#managed) this.#acceptData("local");
      } else if (!this.#managed && this.data !== this.#lastText) this.#acceptData("local");
      this.requestUpdate("data");
    } finally {
      this.#syncing = false;
    }
  }
  #acceptData(mode) {
    this.#mode = mode;
    this.#readyBlock = this.#dataContainer();
    this.#readyScope = this.#scope();
    this.#lastText = this.data;
    this.dataChanged(this.data, this.#context());
    this.requestUpdate("data");
  }
  #dataEvent = (event) => {
    const block = this.#dataContainer();
    if (!this.isConnected || !block || event.target !== block || !this.#scoped(block)) return;
    const detail = event.detail;
    this.#managed = true;
    this.#block = block;
    this.#bindingScope = this.#scope();
    if (detail?.mode) this.#mode = detail.mode;
    else if (this.#mode === "local") this.#mode = !this.hasAttribute("shared") ? "individual" : this.getAttribute("shared") === "group" ? "group" : "all";
    if (event.type === "datachange") this.#acceptData(this.#mode);
    else {
      if (event.type === "datapending") {
        this.#readyBlock = null;
        this.dataPending(this.#context(block));
      } else this.dataError(new Error(detail?.message ?? "Widget data is unavailable"), this.#context(block));
      this.requestUpdate("data");
    }
  };
  /** Updates a data block in place, preserving its identity and attributes.
   * A managed block cannot be written until its current scope is ready. */
  setData(type, value, attrs = {}) {
    if (!isDataBlockType(type)) throw new TypeError(`'${type}' is not a data block type`);
    if (Object.keys(attrs).some((name) => name.toLowerCase() === "src")) throw new TypeError("Data blocks cannot have src");
    this.#syncData();
    const old = this.#dataContainer();
    if (old && this.#managed && !this.dataReady) throw new DOMException("Wait for the current data scope to become ready", "InvalidStateError");
    const text = type === "application/json" ? value.replace(/</g, "\\u003c") : value;
    if (/<\/script[\s/>]/i.test(text)) throw new TypeError("Data blocks cannot contain a closing script tag");
    const block = old ?? this.ownerDocument.createElement("script");
    for (const [name, value2] of Object.entries(attrs)) block.setAttribute(name, value2);
    block.type = type;
    block.textContent = text;
    if (!old) this.append(block);
    this.requestUpdate("data");
  }
  #slotChanged = () => this.requestUpdate();
  connectedCallback() {
    super.connectedCallback();
    this.#observedDocument = this.ownerDocument;
    let followers = contextFollowers.get(this.ownerDocument);
    if (!followers) {
      const widgets = /* @__PURE__ */ new Set();
      const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
      const observer = new Observer(() => widgets.forEach((widget) => widget.#contextChanged()));
      observer.observe(this.ownerDocument.documentElement, { attributes: true, attributeFilter: ["lang", "contenteditable"], subtree: true });
      followers = { widgets, observer };
      contextFollowers.set(this.ownerDocument, followers);
    }
    followers.widgets.add(this);
    this.#language = void 0;
    this.#contextChanged();
    for (const type of ["datapending", "datachange", "dataerror"]) this.addEventListener(type, this.#dataEvent);
    this.#contentObserver.observe(this, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["type", "src", "slot"] });
    this.renderRoot.addEventListener("slotchange", this.#slotChanged);
    this.#block = void 0;
    this.#syncData();
  }
  disconnectedCallback() {
    this.#contentObserver.disconnect();
    for (const type of ["datapending", "datachange", "dataerror"]) this.removeEventListener(type, this.#dataEvent);
    this.renderRoot?.removeEventListener("slotchange", this.#slotChanged);
    this.#readyBlock = null;
    if (this.#observedDocument) {
      const followers = contextFollowers.get(this.#observedDocument);
      followers?.widgets.delete(this);
      if (!followers?.widgets.size) {
        followers?.observer.disconnect();
        contextFollowers.delete(this.#observedDocument);
      }
    }
    this.#observedDocument = void 0;
    super.disconnectedCallback();
  }
};
export {
  LitElementWw,
  isDataBlockType
};
