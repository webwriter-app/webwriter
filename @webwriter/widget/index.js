// options.ts
function requestMedia(host, options) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const event = new CustomEvent("ww-request-media", {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {
        media: options?.media,
        accept: options?.accept,
        resolve: finish
      }
    });
    host.dispatchEvent(event);
    if (!event.defaultPrevented) finish(null);
  });
}

// shapes.ts
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
var isString = (value) => typeof value === "string";
var isBoolean = (value) => typeof value === "boolean";
var isSeries = (value) => Array.isArray(value) && value.every(isNumber);
var isTable = (value) => {
  if (!value || typeof value !== "object") return false;
  const { columns, rows } = value;
  return Array.isArray(columns) && columns.every(isString) && Array.isArray(rows) && rows.every((row) => Array.isArray(row) && row.every((cell) => cell === null || isString(cell) || isNumber(cell)));
};
var guards = { number: isNumber, string: isString, boolean: isBoolean, series: isSeries, table: isTable };
function hasShape(shape, value) {
  return Object.hasOwn(guards, shape) && guards[shape](value);
}
function effectAccepts(effect, shape) {
  const { accepts } = effect;
  if (!Array.isArray(accepts) || !accepts.length) return true;
  return typeof shape === "string" && accepts.includes(shape);
}

// index.ts
var DECLARED_TEXTS = ["label", "description", "placeholder", "confirm", "disabledReason"];
var DECLARED_FLAGS = ["hidden", "disabled", "readOnly"];
var FLAG_ON_ERROR = { hidden: false, disabled: true, readOnly: true };
var DECLARED_LISTS = ["options", "children"];
function isComputed(entry) {
  if (!entry || typeof entry !== "object") return false;
  const fields = entry;
  return DECLARED_TEXTS.some((key) => typeof fields[key] === "function") || DECLARED_FLAGS.some((key) => typeof fields[key] === "function") || DECLARED_LISTS.some((key) => Array.isArray(fields[key]) && fields[key].some(isComputed));
}
function resolveEntry(widget, entry) {
  if (!isComputed(entry)) return entry;
  const resolved = { ...entry };
  for (const key of DECLARED_TEXTS) if (typeof resolved[key] === "function") {
    try {
      resolved[key] = resolved[key](widget);
    } catch {
      resolved[key] = void 0;
    }
  }
  for (const key of DECLARED_FLAGS) if (typeof resolved[key] === "function") {
    let answer;
    try {
      answer = resolved[key](widget);
    } catch {
      answer = FLAG_ON_ERROR[key];
    }
    resolved[key] = answer === void 0 ? void 0 : !!answer;
  }
  for (const key of DECLARED_LISTS) if (Array.isArray(resolved[key])) resolved[key] = resolved[key].map((choice) => resolveEntry(widget, choice));
  return resolved;
}
function hasComputedDeclarations(declarations) {
  return !!declarations && typeof declarations === "object" && Object.values(declarations).some(isComputed);
}
function resolveDeclarations(widget, declarations) {
  if (!hasComputedDeclarations(declarations)) return declarations;
  return Object.fromEntries(Object.entries(declarations).map(([name, entry]) => [name, resolveEntry(widget, entry)]));
}
var offlineAssets = /* @__PURE__ */ new WeakMap();
function assetURL(url, owner = document) {
  const href = new URL(url).href;
  const manifest = owner.head?.querySelector('script#webwriter-offline-assets[type="application/json"]');
  if (!manifest) return href;
  let assets = offlineAssets.get(manifest);
  if (!assets) {
    assets = JSON.parse(manifest.textContent ?? "{}");
    offlineAssets.set(manifest, assets);
  }
  const embedded = assets[href];
  if (typeof embedded !== "string" || !embedded.startsWith("data:")) {
    throw new Error(`Asset is unavailable in Offline HTML: ${href}`);
  }
  return embedded;
}
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
var dataEvents = ["datapending", "datachange", "dataerror", "datarelease"];
var widgetRuntimeAttributes = ["contenteditable", "lang", "shared", "id", "standalone"];
function widgetLanguage(host) {
  for (let node = host; node; ) {
    const source = node.closest("[lang]");
    if (source) return source.getAttribute("lang") ?? "";
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return "";
}
var WidgetRuntime = class {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.callbacks = callbacks;
  }
  #observedDocument;
  #language;
  #editable;
  #listeners = /* @__PURE__ */ new Set();
  #snapshot;
  get lang() {
    return this.callbacks.language?.() ?? widgetLanguage(this.host);
  }
  get editable() {
    return this.callbacks.editable?.() ?? this.host.isContentEditable;
  }
  get standalone() {
    return this.host.getAttribute("standalone");
  }
  set standalone(value) {
    if (value === null) this.host.removeAttribute("standalone");
    else this.host.setAttribute("standalone", value);
  }
  /** The same snapshot object is returned until an observed value changes. */
  getSnapshot = () => {
    const dataBlock = this.dataBlock;
    const previous = this.#snapshot;
    const attributes = Object.fromEntries((this.callbacks.attributes?.() ?? []).map((name) => [name, this.host.getAttribute(name)]));
    const sameAttributes = previous && Object.keys(attributes).length === Object.keys(previous.attributes).length && Object.entries(attributes).every(([name, value]) => previous.attributes[name] === value);
    const next = {
      editable: this.editable,
      lang: this.lang,
      standalone: this.standalone,
      attributes: sameAttributes ? previous.attributes : Object.freeze(attributes),
      data: dataBlock?.textContent ?? null,
      dataType: this.#typeOf(dataBlock),
      dataBlock,
      dataSlot: dataBlock?.getAttribute("slot") ?? null,
      dataMode: this.#mode,
      dataReady: this.#isDataReady(dataBlock),
      dataError: this.#error
    };
    if (previous && Object.entries(next).every(([key, value]) => previous[key] === value)) return previous;
    return this.#snapshot = Object.freeze(next);
  };
  /** Subscribe to host updates and return an unsubscribe function. */
  subscribe = (listener) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #publish(name, previous) {
    this.callbacks.update?.(name, previous);
    this.#listeners.forEach((listener) => listener());
  }
  attributeChanged(name, oldValue, value) {
    if (oldValue === value) return;
    if (name === "lang" || name === "contenteditable") {
      this.contextChanged();
      if (this.callbacks.attributes?.().includes(name)) this.#publish(name, oldValue);
    } else if (name === "shared" || name === "id") {
      this.#readyBlock = null;
      if (this.host.isConnected) this.#syncData();
      else if (this.callbacks.attributes?.().includes(name)) this.#publish(name, oldValue);
    } else this.#publish(name, oldValue);
  }
  contextChanged() {
    const language = this.lang, editable = this.editable;
    if (language !== this.#language) {
      const before = this.#language;
      this.#language = language;
      this.#publish("lang", before);
    }
    if (editable !== this.#editable) {
      const before = this.#editable;
      this.#editable = editable;
      this.#publish("editable", before);
    }
  }
  get dataBlock() {
    const blocks = Array.from(this.host.children).filter((child) => child.namespaceURI === "http://www.w3.org/1999/xhtml" && child.localName === "script" && isDataBlockType(child.type) && !child.hasAttribute("src"));
    return blocks.find((block) => this.#scoped(block)) ?? blocks[0] ?? null;
  }
  #scoped(block) {
    return !!block && block.getAttribute("slot") === "data" && ["application/json", "application/xml"].includes(block.type);
  }
  #scope(block) {
    return JSON.stringify([
      this.host.ownerDocument.documentElement.id,
      this.host.id,
      this.host.getAttribute("shared"),
      block?.type,
      block?.getAttribute("slot"),
      ...Array.from(this.host.childNodes).filter((node) => node.nodeType === 7 && node.nodeName === "ww-grouping").map((node) => node.nodeValue)
    ]);
  }
  get data() {
    return this.dataBlock?.textContent ?? null;
  }
  set data(value) {
    this.setData(this.dataType ?? "text/plain", value ?? "");
  }
  get dataType() {
    return this.#typeOf(this.dataBlock);
  }
  #typeOf(block) {
    return block?.type ?? this.host.constructor.dataType;
  }
  #block;
  #bindingScope;
  #readyBlock = null;
  #readyScope;
  #managed = false;
  #lastText;
  #mode = "local";
  #syncing = false;
  #contentObserver;
  #error = null;
  /** False while the current participant scope is loading or unavailable. */
  get dataReady() {
    return this.#isDataReady(this.dataBlock);
  }
  #isDataReady(block) {
    if (!this.host.isConnected) return false;
    if (!this.#scoped(block)) return true;
    const scope = this.#scope(block);
    return block === this.#block && this.#bindingScope === scope && (!this.#managed || block === this.#readyBlock && this.#readyScope === scope);
  }
  #context(block = this.dataBlock) {
    return { block, mode: this.#mode };
  }
  #syncData() {
    if (!this.host.isConnected || this.#syncing) return;
    this.#syncing = true;
    try {
      const block = this.dataBlock, scope = this.#scope(block);
      if (block !== this.#block || scope !== this.#bindingScope) {
        this.#block = block;
        this.#bindingScope = scope;
        this.#readyBlock = null;
        this.#error = null;
        this.#managed = false;
        this.#mode = "local";
        if (this.#scoped(block)) {
          const Request = this.host.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
          const request = new Request("datarequest", { bubbles: true, cancelable: true });
          if (!block.dispatchEvent(request)) this.#managed = true;
        }
        if (!this.#managed) this.#acceptData("local");
      } else if (!this.#managed && this.data !== this.#lastText) this.#acceptData("local");
      this.#publish("data");
    } finally {
      this.#syncing = false;
    }
  }
  #acceptData(mode) {
    this.#mode = mode;
    this.#readyBlock = this.dataBlock;
    this.#readyScope = this.#scope(this.#readyBlock);
    this.#lastText = this.data;
    this.#error = null;
    this.callbacks.dataChanged?.(this.data, this.#context());
    this.#publish("data");
  }
  #dataEvent = (event) => {
    const block = this.dataBlock;
    if (!this.host.isConnected || !block || event.target !== block || !this.#scoped(block)) return;
    if (event.type === "datarelease") {
      this.#block = void 0;
      this.#syncData();
      return;
    }
    const detail = event.detail;
    this.#managed = true;
    this.#block = block;
    this.#bindingScope = this.#scope(block);
    if (detail?.mode) this.#mode = detail.mode;
    else if (this.#mode === "local") this.#mode = !this.host.hasAttribute("shared") ? "individual" : this.host.getAttribute("shared") === "group" ? "group" : "all";
    if (event.type === "datachange") this.#acceptData(this.#mode);
    else {
      if (event.type === "datapending") {
        this.#readyBlock = null;
        this.#error = null;
        this.callbacks.dataPending?.(this.#context(block));
      } else {
        this.#error = new Error(detail?.message ?? "Widget data is unavailable");
        this.callbacks.dataError?.(this.#error, this.#context(block));
      }
      this.#publish("data");
    }
  };
  /** Updates a data block in place, preserving its identity and attributes.
   * A managed block cannot be written until its current scope is ready. */
  setData(type, value, attrs = {}) {
    if (!isDataBlockType(type)) throw new TypeError(`'${type}' is not a data block type`);
    if (Object.keys(attrs).some((name) => name.toLowerCase() === "src")) throw new TypeError("Data blocks cannot have src");
    this.#syncData();
    const old = this.dataBlock;
    if (old && this.#managed && !this.dataReady) throw new DOMException("Wait for the current data scope to become ready", "InvalidStateError");
    const text = type === "application/json" ? value.replace(/</g, "\\u003c") : value;
    if (/<\/script[\s/>]/i.test(text)) throw new TypeError("Data blocks cannot contain a closing script tag");
    const block = old ?? this.host.ownerDocument.createElement("script");
    for (const [name, value2] of Object.entries(attrs)) block.setAttribute(name, value2);
    block.type = type;
    block.textContent = text;
    if (!old) this.host.append(block);
    this.#publish("data");
  }
  connect() {
    const { host } = this;
    if (this.#observedDocument) return;
    const doc = this.#observedDocument = host.ownerDocument;
    const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
    let followers = contextFollowers.get(doc);
    if (!followers) {
      const runtimes = /* @__PURE__ */ new Set();
      const observer = new Observer(() => runtimes.forEach((runtime) => runtime.contextChanged()));
      observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["lang", "contenteditable"], subtree: true });
      followers = { runtimes, observer };
      contextFollowers.set(doc, followers);
    }
    followers.runtimes.add(this);
    this.#language = void 0;
    this.contextChanged();
    const events = doc.defaultView?.EventTarget.prototype ?? EventTarget.prototype;
    for (const type of dataEvents) events.addEventListener.call(host, type, this.#dataEvent);
    this.#contentObserver = new Observer(() => this.#syncData());
    this.#contentObserver.observe(host, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["type", "src", "slot"] });
    this.#block = void 0;
    this.#syncData();
  }
  disconnect() {
    const doc = this.#observedDocument;
    if (!doc) return;
    this.#observedDocument = void 0;
    this.#contentObserver?.disconnect();
    this.#contentObserver = void 0;
    const events = doc.defaultView?.EventTarget.prototype ?? EventTarget.prototype;
    for (const type of dataEvents) events.removeEventListener.call(this.host, type, this.#dataEvent);
    this.#readyBlock = null;
    const followers = contextFollowers.get(doc);
    followers?.runtimes.delete(this);
    if (followers && !followers.runtimes.size) {
      followers.observer.disconnect();
      contextFollowers.delete(doc);
    }
  }
};
function withWidgetRuntime(Base) {
  return class WidgetElement extends Base {
    static widgetAttributes = [];
    static get observedAttributes() {
      return [.../* @__PURE__ */ new Set([...super.observedAttributes ?? [], ...widgetRuntimeAttributes, ...this.widgetAttributes])];
    }
    widgetRuntime = new WidgetRuntime(this, {
      attributes: () => this.constructor.widgetAttributes
    });
    connectedCallback() {
      this.widgetRuntime.connect();
      super.connectedCallback?.();
    }
    disconnectedCallback() {
      this.widgetRuntime.disconnect();
      super.disconnectedCallback?.();
    }
    attributeChangedCallback(name, oldValue, value) {
      if (Base.observedAttributes?.includes(name)) super.attributeChangedCallback?.(name, oldValue, value);
      this.widgetRuntime.attributeChanged(name, oldValue, value);
    }
  };
}
export {
  WidgetRuntime,
  assetURL,
  effectAccepts,
  hasComputedDeclarations,
  hasShape,
  isBoolean,
  isDataBlockType,
  isNumber,
  isSeries,
  isString,
  isTable,
  requestMedia,
  resolveDeclarations,
  widgetLanguage,
  widgetRuntimeAttributes,
  withWidgetRuntime
};
