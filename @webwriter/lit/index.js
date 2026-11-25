var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));

// index.ts
var index_exports = {};
__export(index_exports, {
  BrowserWidgetResultStorage: () => BrowserWidgetResultStorage,
  HttpWidgetResultStorage: () => HttpWidgetResultStorage,
  LitElementWw: () => LitElementWw,
  WidgetDrawer: () => WidgetDrawer,
  WidgetResultConflict: () => WidgetResultConflict,
  effectAccepts: () => effectAccepts,
  hasShape: () => hasShape,
  isBoolean: () => isBoolean,
  isDataBlockType: () => isDataBlockType,
  isNumber: () => isNumber,
  isSeries: () => isSeries,
  isString: () => isString,
  isTable: () => isTable,
  renderWidgetOptionField: () => renderWidgetOptionField,
  renderWidgetOptions: () => renderWidgetOptions,
  requestMedia: () => requestMedia2,
  resolveDeclarations: () => resolveDeclarations2,
  widgetOptionControlStyles: () => widgetOptionControlStyles,
  widgetResultEndpoint: () => widgetResultEndpoint
});
import { LitElement as LitElement2, adoptStyles } from "lit";
import { SignalWatcher } from "@lit-labs/signals";
import {
  WidgetRuntime,
  hasComputedDeclarations,
  resolveDeclarations,
  widgetLanguage,
  widgetRuntimeAttributes
} from "@webwriter/widget";
import {
  isDataBlockType,
  requestMedia as requestMedia2,
  resolveDeclarations as resolveDeclarations2
} from "@webwriter/widget";
export * from "@lit-labs/signals";
import {
  isNumber,
  isString,
  isBoolean,
  isSeries,
  isTable,
  hasShape,
  effectAccepts
} from "@webwriter/widget";

// widget-drawer.ts
import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";

// widget-option-controls.ts
import { renderWidgetOptionField, renderWidgetOptions } from "@webwriter/widget/widget-option-controls";

// widget-option-controls.styles.ts
import { widgetOptionControlStyles } from "@webwriter/widget/widget-option-controls";

// widget-options.ts
var widget_options_exports = {};
__reExport(widget_options_exports, widget_options_star);
import * as widget_options_star from "@webwriter/widget/widget-options";

// widget-result-storage.ts
var WidgetResultConflict = class extends Error {
  constructor() {
    super("A newer result is already saved.");
  }
};
function isWidgetResultType(type) {
  return type === "application/json" || type === "application/xml";
}
function validateWidgetResult(result) {
  if (result.type === "application/json") {
    if (result.text.trim()) JSON.parse(result.text);
  } else {
    if (/<\/script[\s/>]/i.test(result.text)) throw new Error("XML results cannot contain a closing script tag.");
    const parsed = new DOMParser().parseFromString(result.text, "application/xml");
    if (parsed.getElementsByTagNameNS("http://www.mozilla.org/newlayout/xml/parsererror.xml", "parsererror").length) {
      throw new Error("The widget result must contain valid XML.");
    }
  }
}
var BrowserWidgetResultStorage = class {
  constructor(storage, key) {
    this.storage = storage;
    this.key = key;
  }
  async load(signal) {
    signal.throwIfAborted();
    const revision = this.storage.getItem(this.key);
    if (revision === null) return null;
    const result = JSON.parse(revision);
    if (!isWidgetResultType(result?.type) || typeof result.text !== "string") throw new Error("The browser result is invalid.");
    return { type: result.type, text: result.text, revision };
  }
  async save(result, revision, signal) {
    signal.throwIfAborted();
    if (this.storage.getItem(this.key) !== revision) throw new WidgetResultConflict();
    const next = JSON.stringify(result);
    this.storage.setItem(this.key, next);
    return next;
  }
};
function widgetResultEndpoint(input, base) {
  const url = new URL(input, base);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Enter an HTTP or HTTPS endpoint without credentials or a fragment.");
  }
  return url;
}
function strongETag(response) {
  const value = response.headers.get("ETag");
  return value && /^"[!#-~\u0080-\u00ff]*"$/.test(value) ? value : null;
}
var HttpWidgetResultStorage = class {
  constructor(endpoint, request = globalThis.fetch.bind(globalThis)) {
    this.request = request;
    this.endpoint = widgetResultEndpoint(endpoint.href, endpoint.href);
  }
  endpoint;
  fetch(init, signal) {
    return this.request(this.endpoint.href, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15e3)])
    });
  }
  async load(signal) {
    const response = await this.fetch({ method: "GET", headers: { Accept: "application/json, application/xml" } }, signal);
    if (response.status === 404) return null;
    if (response.status !== 200) throw new Error(`Could not load the remote result (HTTP ${response.status}).`);
    const type = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    if (!isWidgetResultType(type)) throw new Error("The endpoint must return a JSON or XML result.");
    const revision = strongETag(response);
    if (!revision) throw new Error("The endpoint must return a strong ETag.");
    return { type, text: await response.text(), revision };
  }
  async save(result, revision, signal) {
    const response = await this.fetch({
      method: "PUT",
      headers: { "Content-Type": result.type, ...revision === null ? { "If-None-Match": "*" } : { "If-Match": revision } },
      body: result.text
    }, signal);
    if (response.status === 412) throw new WidgetResultConflict();
    if (![200, 201, 204].includes(response.status)) throw new Error(`Could not save the remote result (HTTP ${response.status}).`);
    const next = strongETag(response);
    if (next) return next;
    const stored = await this.load(signal);
    if (stored?.type === result.type && stored.text === result.text) return stored.revision;
    throw new WidgetResultConflict();
  }
};
function widgetResultKey(widget) {
  const path = [];
  for (let node = widget; node; ) {
    const root = node.getRootNode();
    if (node.id && Array.from(root.querySelectorAll("[id]")).filter((element) => element.id === node.id).length === 1) {
      path.unshift(`#${node.id}`);
    } else {
      const siblings = node.parentNode?.children;
      path.unshift(`${node.localName}:${siblings ? Array.from(siblings).indexOf(node) : 0}`);
    }
    if (node.parentElement && !path[0].startsWith("#")) node = node.parentElement;
    else node = "host" in root ? root.host : null;
  }
  const { origin, pathname, search } = new URL(widget.ownerDocument.URL);
  return `webwriter:widget-result:${JSON.stringify([origin, pathname, search, path])}`;
}

// widget-result-binding.ts
function widgetResultBlock(widget) {
  return Array.from(widget.children).find((child) => child.localName === "script" && child.namespaceURI === "http://www.w3.org/1999/xhtml" && child.getAttribute("slot") === "data" && isWidgetResultType(child.getAttribute("type")) && !child.hasAttribute("src"));
}
var WidgetResultBinding = class {
  constructor(block, type, defaults, storage, update) {
    this.block = block;
    this.type = type;
    this.defaults = defaults;
    this.storage = storage;
    this.update = update;
    this.widget = block.parentElement;
    this.setting = this.widget.getAttribute("standalone")?.trim() ?? null;
    this.loadBase = this.observed = this.saved = block.textContent ?? "";
    block.addEventListener("datarequest", this.request, { signal: this.controller.signal });
    void this.load();
  }
  controller = new AbortController();
  revision = null;
  loadBase;
  observed;
  saved;
  ready = false;
  saving = false;
  status = { state: "loading" };
  widget;
  setting;
  get current() {
    return this.widget.isConnected && (this.widget.getAttribute("standalone")?.trim() ?? null) === this.setting && widgetResultBlock(this.widget) === this.block && this.block.type === this.type;
  }
  get dirty() {
    return this.block.textContent !== (this.ready ? this.saved : this.loadBase);
  }
  request = (event) => {
    if (event.target !== this.block || event.defaultPrevented) return;
    event.preventDefault();
    this.notify(this.ready ? "datachange" : "datapending");
  };
  notify(type, detail = {}) {
    this.block.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { mode: "local", ...detail } }));
  }
  report(state, message) {
    this.status = { state, message };
    this.update(this.status);
    if (state === "loading") this.notify("datapending");
    if (state === "saving" || state === "saved" || state === "error" || state === "conflict") {
      this.notify("datapersistence", { state: state === "saving" ? "pending" : state === "saved" ? "saved" : "error", message });
    }
  }
  fail(error) {
    if (this.controller.signal.aborted) return;
    const message = error instanceof Error ? error.message : String(error);
    if (!this.ready) this.notify("dataerror", { message });
    this.report(error instanceof WidgetResultConflict ? "conflict" : "error", message);
  }
  async load() {
    const signal = this.controller.signal;
    this.report("loading");
    try {
      const stored = await this.storage.load(signal);
      if (signal.aborted || !this.current) return;
      if (stored && stored.type !== this.type) throw new Error("The saved result uses a different format.");
      if (stored) validateWidgetResult(stored);
      this.revision = stored?.revision ?? null;
      const text = stored?.text ?? this.defaults;
      this.saved = this.type === "application/json" ? text.replace(/</g, "\\u003c") : text;
      const changedDuringLoad = this.block.textContent !== this.loadBase;
      if (!changedDuringLoad && this.block.textContent !== this.saved) this.block.textContent = this.saved;
      this.observed = this.block.textContent ?? "";
      this.ready = true;
      this.notify("datachange");
      if (stored && changedDuringLoad && this.dirty) this.fail(new WidgetResultConflict());
      else {
        this.report(stored ? "saved" : "ready");
        void this.flush();
      }
    } catch (error) {
      this.fail(error);
    }
  }
  changed() {
    if (!this.ready || this.controller.signal.aborted) return;
    const text = this.block.textContent ?? "";
    if (text === this.observed) return;
    this.observed = text;
    this.notify("datachange");
    if (this.status.state === "error") this.report("ready");
    void this.flush();
  }
  retry() {
    if (this.status.state !== "error") return;
    if (!this.ready) void this.load();
    else {
      this.report("ready");
      void this.flush();
    }
  }
  async flush() {
    if (!this.ready || this.saving || this.status.state === "conflict" || this.status.state === "error") return;
    const signal = this.controller.signal;
    this.saving = true;
    try {
      while (!signal.aborted && this.current && this.dirty) {
        const result = { type: this.type, text: this.block.textContent ?? "" };
        validateWidgetResult(result);
        this.report("saving");
        const revision = await this.storage.save(result, this.revision, signal);
        if (signal.aborted || !this.current) return;
        this.revision = revision;
        this.saved = result.text;
      }
      if (!signal.aborted && this.status.state === "saving") this.report("saved");
    } catch (error) {
      this.fail(error);
    } finally {
      this.saving = false;
    }
  }
  destroy() {
    this.controller.abort();
    this.notify("datarelease");
  }
};

// widget-drawer.ts
var authoredDefaults = /* @__PURE__ */ new WeakMap();
var browser = { kind: "browser" };
var WidgetDrawer = class extends LitElement {
  static properties = {
    widget: { attribute: false },
    storageFor: { attribute: false }
  };
  static styles = [widgetOptionControlStyles, css`
    :host { display: block; min-inline-size: 0; font: 0.875rem/1.4 system-ui, sans-serif; color: #263548; }
    details { min-inline-size: 0; }
    .drawer { border: 1px solid #c5ccd5; border-radius: .4rem; background: #fff; }
    .drawer > summary { cursor: pointer; padding: .45rem .65rem; font-weight: 600; }
    .contents { display: grid; gap: .65rem; padding: 0 .65rem .65rem; }
    .widget-options { min-width: 0; }
    .develop-field { display: grid; gap: .3rem; min-width: 0; }
    .develop-field.widget-option-checkbox { display: flex; }
    .develop-field-label, .storage-controls label { font-weight: 600; }
    .develop-field-help { color: #4f6075; font-size: .75rem; }
    .widget-option-group { font-size: inherit; }
    .widget-options .widget-option-field :is(input:not([type="checkbox"], [type="radio"], [type="range"]), textarea),
    input, select, button { font: inherit; }
    select, #storage-url, button {
      box-sizing: border-box; max-inline-size: 100%; min-inline-size: 0; padding: .22rem .4rem;
      border: 1px solid #c5ccd5; border-radius: .25rem; background: #fff; color: inherit;
    }
    button { cursor: pointer; white-space: normal; overflow-wrap: anywhere; }
    button:disabled { cursor: default; opacity: .55; }
    :is(button, input, select, summary):focus-visible { outline: 2px solid #3977c7; outline-offset: 2px; }
    .widget-action { width: 100%; }
    .widget-action[data-intent="danger"], .error { color: #a72c25; }
    .choice-group, .conversion-group { display: flex; flex-wrap: wrap; gap: .25rem; }
    .choice-group > * { flex: 1 1 auto; }
    .storage-controls {
      display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .3rem .5rem;
      min-width: 0; border-top: 1px solid #dce3ec; padding-block-start: .5rem;
    }
    .storage-endpoint { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .3rem; }
    .widget-option-value > input[type="color"] { flex: 0 1 auto; inline-size: 3rem; }
    @media print { :host { display: none; } }
  `];
  target;
  observer;
  setting;
  identity;
  key;
  destination;
  draftKind = "browser";
  draftUrl = "";
  binding;
  defaults;
  status;
  running;
  actionError;
  fileSelection;
  connectedCallback() {
    super.connectedCallback();
    this.requestUpdate();
  }
  disconnectedCallback() {
    this.detach();
    super.disconnectedCallback();
  }
  willUpdate(changes) {
    if (this.isConnected && this.target !== this.widget) {
      this.detach();
      this.target = this.widget;
      if (this.target) {
        this.target.addEventListener("optionschange", this.optionsChanged);
        this.observer = new MutationObserver((records) => {
          const widget = this.target;
          if (!records.some(({ target }) => target === widget || target.parentNode === widget || this.binding?.block.contains(target))) return;
          this.sync();
          this.requestUpdate();
        });
        this.observer.observe(this.target, { attributes: true, characterData: true, childList: true, subtree: true });
      }
    }
    if (changes.has("storageFor") && this.binding) {
      this.binding.destroy();
      this.binding = void 0;
      this.status = void 0;
    }
    this.sync();
  }
  optionsChanged = (event) => {
    if (event.target === this.target) this.requestUpdate();
  };
  detach() {
    this.observer?.disconnect();
    this.observer = void 0;
    this.target?.removeEventListener("optionschange", this.optionsChanged);
    this.target = void 0;
    this.reset();
  }
  reset() {
    this.binding?.destroy();
    this.binding = void 0;
    this.defaults = void 0;
    this.status = void 0;
    this.running = void 0;
    this.fileSelection = void 0;
    this.actionError = void 0;
    this.setting = void 0;
    this.key = void 0;
    this.destination = void 0;
  }
  active(widget = this.target) {
    return !!widget && widget === this.target && this.isConnected && widget.isConnected && widget.hasAttribute("standalone");
  }
  get preferenceKey() {
    return `${this.key}:destination:${this.setting}`;
  }
  browserStorage() {
    const storage = this.ownerDocument.defaultView?.localStorage;
    if (!storage) throw new Error("Browser storage is unavailable.");
    return storage;
  }
  endpoint(url) {
    if (!url.trim()) throw new Error("Enter a storage endpoint.");
    return widgetResultEndpoint(url.trim(), this.ownerDocument.baseURI).href;
  }
  sync() {
    const widget = this.target;
    if (!this.active(widget)) {
      if (this.setting !== void 0) this.reset();
      return;
    }
    const setting = widget.getAttribute("standalone").trim();
    const identity = widget.id;
    if (setting !== this.setting || identity !== this.identity) {
      this.binding?.destroy();
      this.binding = void 0;
      this.status = void 0;
      this.setting = setting;
      this.identity = identity;
      this.key = widgetResultKey(widget);
      let preference = null;
      try {
        preference = this.browserStorage().getItem(this.preferenceKey);
      } catch {
      }
      const url = preference ?? setting;
      this.draftKind = url ? "http" : "browser";
      this.draftUrl = url || setting;
      try {
        this.destination = url ? { kind: "http", url: this.endpoint(url) } : browser;
        if (this.destination.kind === "http") this.draftUrl = this.destination.url;
      } catch {
        this.destination = void 0;
      }
    }
    const block = widgetResultBlock(widget);
    const type = block?.type;
    if (this.binding && (this.binding.block !== block || this.binding.type !== type)) {
      this.binding.destroy();
      this.binding = void 0;
      this.status = void 0;
    }
    if (!block || !isWidgetResultType(type)) {
      this.defaults = void 0;
      return;
    }
    if (this.defaults?.block !== block || this.defaults.type !== type) {
      const savedDefaults = authoredDefaults.get(block);
      const defaults = savedDefaults?.type === type ? savedDefaults : { type, text: block.textContent ?? "" };
      authoredDefaults.set(block, defaults);
      this.defaults = { block, ...defaults };
    }
    if (!this.binding && this.destination && !this.status) this.bind(block, type);
    this.binding?.changed();
  }
  bind(block, type) {
    if (!this.destination || !this.defaults || !this.key) return;
    try {
      const storage = this.storageFor?.(this.destination, this.key) ?? (this.destination.kind === "browser" ? new BrowserWidgetResultStorage(this.browserStorage(), this.key) : new HttpWidgetResultStorage(new URL(this.destination.url)));
      this.binding = new WidgetResultBinding(block, type, this.defaults.text, storage, (status) => {
        this.status = status;
        this.requestUpdate();
      });
    } catch (error) {
      this.status = { state: "error", message: this.message(error) };
      block.dispatchEvent(new CustomEvent("datapersistence", {
        bubbles: true,
        detail: { state: "error", mode: "local", message: this.status.message }
      }));
    }
  }
  chooseStorage = (event) => {
    const kind = event.currentTarget.value;
    if (kind === "http") this.draftKind = "http";
    else if (this.switchStorage(browser)) this.draftKind = "browser";
    this.requestUpdate();
  };
  applyStorage = (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector("#storage-url");
    if (!input) return;
    let url;
    try {
      url = this.endpoint(input.value);
    } catch (error) {
      input.setCustomValidity(this.message(error));
      input.reportValidity();
      return;
    }
    if (this.switchStorage({ kind: "http", url })) this.draftUrl = url;
    this.requestUpdate();
  };
  switchStorage(destination) {
    if (this.status?.state === "saving") return false;
    if (destination.kind === this.destination?.kind && (destination.kind === "browser" || this.destination.kind === "http" && this.destination.url === destination.url)) {
      if (this.status?.state === "error") {
        if (this.binding) this.binding.retry();
        else {
          this.status = void 0;
          this.sync();
        }
      }
      return true;
    }
    if (this.binding?.dirty && !this.confirm("Switch storage and discard the unsaved result?")) return false;
    this.binding?.destroy();
    this.binding = void 0;
    this.status = void 0;
    this.destination = destination;
    try {
      this.browserStorage().setItem(this.preferenceKey, destination.kind === "http" ? destination.url : "");
    } catch {
    }
    this.sync();
    return true;
  }
  /** The widget's own message, or a generic one for a failure without a message. */
  message(error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return message.trim() ? message : "The action could not be completed.";
  }
  confirm(text) {
    return this.ownerDocument.defaultView?.confirm?.(text) === true;
  }
  locale(widget) {
    return widget.closest("[lang]")?.getAttribute("lang") ?? widget.ownerDocument.documentElement.lang ?? "en";
  }
  option(widget, name, declaration) {
    const option = (0, widget_options_exports.readWidgetOption)(widget, name, declaration, this.locale(widget));
    return (0, widget_options_exports.widgetReferenceOption)(
      widget,
      option,
      widget.getRootNode(),
      (element) => element.namespaceURI === "http://www.w3.org/1999/xhtml" && element.localName.includes("-") && element.matches(":defined")
    );
  }
  setOption = (name, value) => {
    const widget = this.target;
    if (!this.active(widget)) return;
    const declarations = (0, widget_options_exports.widgetDeclarations)(widget, "options");
    if (!Object.hasOwn(declarations, name)) return;
    const option = this.option(widget, name, declarations[name]);
    if (option.hidden || option.disabled || option.readOnly || !(0, widget_options_exports.validWidgetOptionValue)(option, value, widget)) {
      this.requestUpdate();
      return;
    }
    try {
      if (option.attribute === null) widget[name] = value;
      else {
        const attribute = option.attribute.toLowerCase();
        if (attribute.startsWith("on") || ["srcdoc", "style", "class", "is", "contenteditable", "spellcheck", "data-webwriter-editor-only", "standalone"].includes(attribute)) {
          throw new TypeError(`The ${attribute} attribute cannot be set as an option.`);
        }
        const text = (0, widget_options_exports.widgetOptionAttributeValue)(option.type, value, option.multiple, option.inverted);
        if (text === null) widget.removeAttribute(option.attribute);
        else {
          const url = text.toLowerCase().replace(/[\u0000-\u0020]/g, "");
          if (["href", "src", "xlink:href", "action", "formaction", "poster", "cite", "data"].includes(attribute) && /^(?:javascript:|vbscript:|data:(?:text\/html|image\/svg\+xml))/.test(url)) throw new TypeError("The option contains an unsafe URL.");
          widget.setAttribute(option.attribute, text);
        }
      }
      this.actionError = void 0;
    } catch (error) {
      this.actionError = { name: "", message: this.message(error) };
    }
    this.requestUpdate();
  };
  action(widget, name) {
    const declarations = (0, widget_options_exports.widgetDeclarations)(widget, "actions");
    const method = Object.hasOwn(declarations, name) ? (0, widget_options_exports.widgetConversionMethod)(widget, name) : void 0;
    return method ? { method, state: (0, widget_options_exports.widgetActionState)(name, declarations[name], this.locale(widget)) } : void 0;
  }
  async run(name, operation) {
    if (this.running) return;
    const invocation = this.running = Symbol();
    this.actionError = void 0;
    this.requestUpdate();
    try {
      await operation();
    } catch (error) {
      if (this.running === invocation) this.actionError = { name, message: this.message(error) };
    } finally {
      if (this.running === invocation) {
        this.running = void 0;
        this.requestUpdate();
      }
    }
  }
  invoke = (name) => {
    const widget = this.target;
    if (!this.active(widget) || this.running || this.fileSelection) return;
    const action = this.action(widget, name);
    if (!action || action.state.hidden || action.state.disabled) return;
    if (action.state.confirm && !this.confirm(action.state.confirm)) return;
    const invoke = async (files) => {
      const current = this.action(widget, name);
      if (!this.active(widget) || current?.method !== action.method || current.state.hidden || current.state.disabled || current.state.confirm !== action.state.confirm || JSON.stringify(current.state.input) !== JSON.stringify(action.state.input)) return;
      if (files && !current.state.input?.multiple && files.length !== 1) return;
      await this.run(name, async () => {
        if (files) await action.method.call(widget, files);
        else await action.method.call(widget);
      });
    };
    if (action.state.input) this.pick({ accept: action.state.input.accept ?? "", multiple: action.state.input.multiple, select: invoke });
    else void invoke();
  };
  pick(selection) {
    const input = this.renderRoot.querySelector("input[type=file]");
    input.accept = selection.accept;
    input.multiple = selection.multiple === true;
    input.value = "";
    this.fileSelection = selection;
    try {
      input.click();
    } catch (error) {
      this.fileSelection = void 0;
      this.actionError = { name: "", message: this.message(error) };
    }
    this.requestUpdate();
  }
  filePicked = (event) => {
    const selection = this.fileSelection;
    this.fileSelection = void 0;
    this.requestUpdate();
    if (!selection || event.type === "cancel") return;
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length) void selection.select(files);
  };
  formats(widget, direction) {
    return Object.entries((0, widget_options_exports.widgetDeclarations)(widget, direction)).filter(([format, declaration]) => (0, widget_options_exports.isWidgetFileFormat)(format) && (0, widget_options_exports.widgetConversionMethod)(widget, declaration)).map(([format]) => format);
  }
  convert(widget, direction, format) {
    if (!this.active(widget) || this.running || this.fileSelection) return;
    const lookup = () => {
      const declarations = (0, widget_options_exports.widgetDeclarations)(widget, direction);
      return Object.hasOwn(declarations, format) ? (0, widget_options_exports.widgetConversionMethod)(widget, declarations[format]) : void 0;
    };
    const method = lookup();
    if (!method) return;
    const execute = async (files) => this.run(`${direction}:${format}`, async () => {
      if (!this.active(widget) || lookup() !== method) return;
      const file = files?.[0];
      if (direction === "convertFrom" && (!file || !(0, widget_options_exports.matchesWidgetFileFormat)(file, format))) {
        throw new TypeError(`Choose a ${format} file to import.`);
      }
      const snapshot = file ? widget.outerHTML : null;
      const result = await (file ? method.call(widget, file) : method.call(widget));
      if (!this.active(widget) || lookup() !== method) return;
      if (result === null || result === false) {
        if (file) throw new Error("The file could not be imported into the selected widget.");
        return;
      }
      if (snapshot !== null && snapshot !== widget.outerHTML) throw new Error("The widget changed before the file could be imported.");
      if (file) {
        if (typeof result !== "function") throw new TypeError("A file importer must return a function that applies the imported content.");
        result.call(widget);
      } else {
        const view = widget.ownerDocument.defaultView;
        if (!(result instanceof view.File) || !result.name || !(0, widget_options_exports.matchesWidgetFileFormat)(result, format)) {
          throw new TypeError(`The widget must return a ${format} file.`);
        }
        const url = view.URL.createObjectURL(result);
        const link = widget.ownerDocument.createElement("a");
        link.href = url;
        link.download = result.name;
        link.click();
        view.setTimeout(() => view.URL.revokeObjectURL(url), 1e3);
      }
    });
    if (direction === "convertFrom") this.pick({ accept: format, select: execute });
    else void execute();
  }
  renderActions(actions) {
    const button = (action) => html`<div class="widget-action-item">
      <button type="button" class="widget-action" data-intent=${action.intent ?? nothing}
        ?disabled=${action.disabled || this.running || this.fileSelection} @click=${() => this.invoke(action.name)}>${action.label}</button>
      ${action.description ? html`<span class="develop-field-help">${action.description}</span>` : nothing}
      ${action.disabled && action.disabledReason ? html`<span class="develop-field-help">${action.disabledReason}</span>` : nothing}
      ${this.actionError?.name === action.name ? html`<span class="widget-action-error" role="alert">${this.actionError.message}</span>` : nothing}
    </div>`;
    return html`<div class="widget-actions">${(0, widget_options_exports.widgetActionRows)(actions).map((row) => row.length === 1 ? button(row[0]) : html`<div class="choice-group widget-action-group" role="group">${row.map(button)}</div>`)}</div>`;
  }
  renderConversions(widget) {
    const imports = this.formats(widget, "convertFrom");
    const exports = this.formats(widget, "convertTo");
    if (!imports.length && !exports.length) return nothing;
    const buttons = (formats, direction, label) => formats.map((format) => html`
      <button type="button" ?disabled=${this.running || this.fileSelection}
        @click=${() => this.convert(widget, direction, format)}>${label} ${format}</button>
    `);
    return html`<div class="conversion-group" role="group" aria-label="Import and export">
      ${buttons(imports, "convertFrom", "Import")}${buttons(exports, "convertTo", "Export")}
    </div>`;
  }
  renderStorage() {
    const saving = this.status?.state === "saving";
    return html`<form class="storage-controls" @submit=${this.applyStorage}>
      <label for="storage-kind">Autosave to</label>
      <select id="storage-kind" .value=${live(this.draftKind)} ?disabled=${saving} @change=${this.chooseStorage}>
        <option value="browser">This browser</option><option value="http">Remote endpoint</option>
      </select>
      ${this.draftKind === "http" ? html`<div class="storage-endpoint">
        <input id="storage-url" type="text" inputmode="url" spellcheck="false" required
          aria-label="Endpoint URL" placeholder="Endpoint URL" .value=${live(this.draftUrl)} @input=${(event) => {
      const input = event.currentTarget;
      input.setCustomValidity("");
      this.draftUrl = input.value;
    }}>
        <button type="submit" ?disabled=${saving}>Apply</button>
      </div>` : nothing}
    </form>`;
  }
  render() {
    const widget = this.target;
    if (!this.active(widget)) return nothing;
    const options = Object.entries((0, widget_options_exports.widgetDeclarations)(widget, "options")).map(([name, declaration]) => this.option(widget, name, declaration));
    const actions = Object.keys((0, widget_options_exports.widgetDeclarations)(widget, "actions")).flatMap((name) => {
      const action = this.action(widget, name);
      return action ? [action.state] : [];
    });
    const groups = Object.entries((0, widget_options_exports.widgetDeclarations)(widget, "optionGroups")).map(([name, declaration]) => (0, widget_options_exports.widgetOptionGroupState)(name, declaration, this.locale(widget)));
    const controls = renderWidgetOptions(
      options,
      actions,
      groups,
      (option) => renderWidgetOptionField(option, this.setOption),
      (actions2) => this.renderActions(actions2)
    );
    const conversions = this.renderConversions(widget);
    if (controls === nothing && conversions === nothing && !this.defaults) return nothing;
    return html`<details class="drawer" part="drawer">
      <summary part="summary">Widget settings</summary>
      <div class="contents">
        ${controls}${conversions}
        ${this.running ? html`<span role="status">Working…</span>` : nothing}
        ${this.actionError && !actions.some((action) => action.name === this.actionError?.name) ? html`<p class="error" role="alert">${this.actionError.message}</p>` : nothing}
        ${this.defaults ? this.renderStorage() : nothing}
      </div>
    </details>
    <input type="file" hidden @change=${this.filePicked} @cancel=${this.filePicked}>`;
  }
};

// index.ts
__reExport(index_exports, widget_options_exports);
var registries = /* @__PURE__ */ new WeakMap();
var warnedDeclarations = /* @__PURE__ */ new WeakMap();
function warnForDeclarationClashes(widget) {
  const location = widget.ownerDocument.defaultView?.location;
  if (!("litIssuedWarnings" in globalThis) && !["localhost", "127.0.0.1", "[::1]"].includes(location?.hostname ?? "")) return;
  const owner = widget.constructor;
  let warned = warnedDeclarations.get(owner);
  if (!warned) warnedDeclarations.set(owner, warned = /* @__PURE__ */ new Set());
  const own = widget;
  const isMap = (value) => {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };
  for (const name of ["permissions", "options", "actions", "data", "localize"]) {
    if (warned.has(name)) continue;
    let valid;
    try {
      const value = own[name];
      valid = name === "data" ? !Object.hasOwn(widget, name) : value === void 0 || (name === "localize" ? typeof value?.getLocale === "function" && typeof value?.setLocale === "function" : isMap(value) && Object.values(value).every(isMap));
    } catch {
      valid = false;
    }
    if (!valid) {
      warned.add(name);
      console.warn(`<${widget.localName}> uses "${name}" for a value that conflicts with the WebWriter widget API.`);
    }
  }
}
var LitElementWw = class extends SignalWatcher(LitElement2) {
  // Wider than CustomElementConstructor: component libraries type properties such as
  // `autocorrect` differently from the DOM library, and their classes have to fit here.
  static scopedElements = {};
  // A text of a static declaration may be a function of the widget, for a text from the widget's own catalog.
  static options = {};
  static actions = {};
  static optionGroups = {};
  static dataType = void 0;
  localize;
  constructor() {
    super();
    const declared = this.constructor;
    for (const kind of ["options", "actions", "permissions", "optionGroups"]) {
      if (kind in this || !hasComputedDeclarations(declared[kind])) continue;
      Object.defineProperty(this, kind, {
        configurable: true,
        get: () => resolveDeclarations(this, declared[kind]),
        set: (value) => Object.defineProperty(this, kind, { value, writable: true, configurable: true, enumerable: true })
      });
    }
  }
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
  /** Empty opts into local storage. A URL supplies the initial remote destination. */
  get standalone() {
    return this.#runtime.standalone;
  }
  set standalone(value) {
    this.#runtime.standalone = value;
  }
  /** An explicit lang="" stops inheritance. Inherited values stay off the DOM. */
  get lang() {
    return widgetLanguage(this);
  }
  set lang(value) {
    if (value === null || value === void 0) this.removeAttribute("lang");
    else this.setAttribute("lang", value);
  }
  static get observedAttributes() {
    return [.../* @__PURE__ */ new Set([...super.observedAttributes, ...widgetRuntimeAttributes])];
  }
  attributeChangedCallback(name, oldValue, value) {
    super.attributeChangedCallback(name, oldValue, value);
    if (widgetRuntimeAttributes.includes(name)) this.#runtime.attributeChanged(name, oldValue, value);
  }
  #runtime = new WidgetRuntime(this, {
    language: () => this.lang,
    editable: () => this.editable,
    update: (name, previous) => {
      this.requestUpdate(name, previous);
      if (name === "lang" && this.isConnected && this.localize) {
        const failed = (error) => {
          this.dispatchEvent(new CustomEvent("localizationerror", { detail: { error } }));
          this.requestUpdate();
        };
        try {
          void Promise.resolve(this.localize.setLocale(this.lang)).then(() => this.requestUpdate(), failed);
        } catch (error) {
          failed(error);
        }
      }
    },
    dataPending: (context) => this.dataPending(context),
    dataChanged: (value, context) => this.dataChanged(value, context),
    dataError: (error, context) => this.dataError(error, context)
  });
  get widgetRuntime() {
    return this.#runtime;
  }
  languageChanged() {
    this.#runtime.contextChanged();
  }
  get data() {
    return this.#runtime.data;
  }
  set data(value) {
    this.setData(this.dataType ?? "text/plain", value ?? "");
  }
  get dataType() {
    return this.#runtime.dataType;
  }
  get dataReady() {
    return this.#runtime.dataReady;
  }
  /** Update the widget's presentation when the data scope changes. */
  dataPending(context) {
  }
  dataChanged(value, context) {
  }
  dataError(error, context) {
  }
  /** Updates a data block in place, preserving its identity and attributes. */
  setData(type, value, attrs = {}) {
    this.#runtime.setData(type, value, attrs);
  }
  #slotChanged = () => this.requestUpdate();
  connectedCallback() {
    super.connectedCallback();
    warnForDeclarationClashes(this);
    this.renderRoot.addEventListener("slotchange", this.#slotChanged);
    this.#runtime.connect();
  }
  disconnectedCallback() {
    this.#runtime.disconnect();
    this.renderRoot?.removeEventListener("slotchange", this.#slotChanged);
    super.disconnectedCallback();
  }
};
export {
  BrowserWidgetResultStorage,
  HttpWidgetResultStorage,
  LitElementWw,
  WidgetDrawer,
  WidgetResultConflict,
  effectAccepts,
  hasShape,
  isBoolean,
  isDataBlockType,
  isNumber,
  isSeries,
  isString,
  isTable,
  renderWidgetOptionField,
  renderWidgetOptions,
  requestMedia2 as requestMedia,
  resolveDeclarations2 as resolveDeclarations,
  widgetOptionControlStyles,
  widgetResultEndpoint
};
