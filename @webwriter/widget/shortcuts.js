import { ModuleCore, warnOnce } from "./base.js";
import { Messages } from "./messages.js";
import { shortcutsMessages } from "./messages/shortcuts/index.js";
import { can } from "./permissions.js";
import { transaction } from "./transaction.js";
import { shortcutsMessages as shortcutsMessages2 } from "./messages/shortcuts/index.js";
function isApple() {
  const platform = navigator.userAgentData?.platform ?? navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform);
}
const ALIASES = { space: " ", plus: "+" };
function parse(shortcut) {
  const parts = shortcut.split("+");
  let key = parts.pop();
  if (key === "" && parts.length) {
    parts.pop();
    key = "+";
  }
  const mods = new Set(parts.map((part) => part.trim().toLowerCase()));
  const name = key.trim() || key;
  return {
    ctrl: mods.has("ctrl") || mods.has("control"),
    meta: mods.has("meta"),
    alt: mods.has("alt"),
    shift: mods.has("shift"),
    mod: mods.has("mod"),
    key: ALIASES[name.toLowerCase()] ?? name
  };
}
const isPosition = (key) => /^[a-z0-9]$/i.test(key);
const isForeignLetter = (key) => /^\p{L}$/u.test(key) && !/^\p{Script=Latin}$/u.test(key);
function match({ ctrl, meta, alt, shift, mod, key }, event, apple) {
  if (event.ctrlKey !== (ctrl || mod && !apple)) return null;
  if (event.metaKey !== (meta || mod && apple)) return null;
  if (event.altKey !== alt) return null;
  const strict = key.length > 1 || key === " " || /\p{L}/u.test(key) || shift;
  if (event.key.toLowerCase() === key.toLowerCase()) return strict && event.shiftKey !== shift ? null : "key";
  const elsewhere = isForeignLetter(event.key) || alt && !isPosition(event.key);
  if (!isPosition(key) || !elsewhere || event.shiftKey !== shift || event.getModifierState?.("AltGraph")) return null;
  return event.code === (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) ? "code" : null;
}
function matchesShortcut(shortcut, event, apple = isApple()) {
  return match(parse(shortcut), event, apple) !== null;
}
const RESERVED = ["Mod+Z", "Mod+Shift+Z", "Mod+Y", "Mod+S"].map(parse);
function isReservedShortcut(shortcut) {
  const { ctrl, meta, alt, shift, mod, key } = parse(shortcut);
  if (alt || !(mod || ctrl || meta)) return false;
  return RESERVED.some((reserved) => reserved.key.toLowerCase() === key.toLowerCase() && reserved.shift === shift);
}
const APPLE_SYMBOLS = { enter: "↩", escape: "⎋", tab: "⇥", backspace: "⌫", delete: "⌦", home: "↖", end: "↘", pageup: "⇞", pagedown: "⇟" };
const ARROWS = { arrowleft: "←", arrowup: "↑", arrowright: "→", arrowdown: "↓" };
const NAMED = {
  " ": "space",
  enter: "enter",
  escape: "escape",
  tab: "tab",
  backspace: "backspace",
  delete: "delete",
  insert: "insert",
  home: "home",
  end: "end",
  pageup: "pageUp",
  pagedown: "pageDown"
};
function formatShortcut(shortcut, format = {}) {
  const apple = format.apple ?? isApple();
  const names = format.names ?? shortcutsMessages.defaults;
  const { ctrl, meta, alt, shift, mod, key } = parse(shortcut);
  const lower = key.toLowerCase();
  const named = NAMED[lower];
  const shown = ARROWS[lower] ?? (apple ? APPLE_SYMBOLS[lower] : void 0) ?? (named ? names[named] : key.length === 1 ? key.toUpperCase() : key);
  if (apple) return `${ctrl ? "⌃" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${meta || mod ? "⌘" : ""}${shown}`;
  const mods = [ctrl || mod ? names.control : "", meta ? names.meta : "", alt ? names.alt : "", shift ? names.shift : ""];
  return [...mods.filter(Boolean), shown].join("+");
}
function ariaShortcut(shortcut, apple = isApple()) {
  const { ctrl, meta, alt, shift, mod, key } = parse(shortcut);
  const name = key === " " ? "Space" : key === "+" ? "Plus" : key.length === 1 ? key.toUpperCase() : key;
  const mods = [ctrl || mod && !apple ? "Control" : "", alt ? "Alt" : "", shift ? "Shift" : "", meta || mod && apple ? "Meta" : ""];
  return [...mods.filter(Boolean), name].join("+");
}
const role = (...names) => names.map((name) => `[role="${name}"]`).join(", ");
const TEXT_ROLES = role("textbox", "searchbox", "combobox", "spinbutton");
const NO_TEXT_INPUT = /^(button|checkbox|color|file|image|radio|range|reset|submit)$/;
const PRESSABLE = `button, summary, a[href], input, audio[controls], video[controls], ${role("button", "link", "checkbox", "switch", "radio", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "treeitem")}`;
const MOVABLE = `input[type="range"], input[type="radio"], audio[controls], video[controls], ${role(
  "slider",
  "scrollbar",
  "radio",
  "radiogroup",
  "tab",
  "tablist",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "listbox",
  "option",
  "tree",
  "treeitem",
  "grid",
  "gridcell",
  "row"
)}`;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, iframe, audio[controls], video[controls], [tabindex], [contenteditable]:not([contenteditable="false"])';
function usedByControl(target, event, host) {
  if (target === host || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key === " " || event.key === "Enter") return target.matches(PRESSABLE);
  return /^(Arrow|Home$|End$|Page)/.test(event.key) && target.matches(MOVABLE);
}
function isOpaque(target, host) {
  if (target === host || !target.localName.includes("-") || target.shadowRoot || target.hasAttribute("tabindex")) return false;
  return target.getRootNode().activeElement === target;
}
class ShortcutsCore extends ModuleCore {
  #options;
  #messages;
  #snapshot = { running: [] };
  #apple;
  #checked = false;
  constructor(host, options = {}) {
    super(host, options);
    this.#options = options;
    this.#apple = options.apple ?? isApple();
    this.#messages = new Messages(host, shortcutsMessages, options.messages);
  }
  /** The declared actions. An instance declaration replaces the static one, as in the editor. */
  get actions() {
    const host = this.host;
    return host.actions ?? host.constructor.actions ?? {};
  }
  /**
   * The keys that run an action, as declared. Empty for an action that
   * cannot run from a key: one that is disabled, asks for confirmation or
   * takes a file. Keys the editor reserves are left out.
   */
  keysOf(action) {
    const declared = this.actions[action];
    if (!declared || declared.disabled === true || declared.confirm || declared.input) return [];
    const { shortcut } = declared;
    const keys = shortcut === void 0 ? [] : typeof shortcut === "string" ? [shortcut] : [...shortcut];
    return keys.filter((key) => !isReservedShortcut(key));
  }
  /** The keys of an action as a person reads them on this platform and in the widget's language, for a tooltip or a menu. */
  labelsOf(action) {
    const names = this.#messages.current;
    return this.keysOf(action).map((shortcut) => formatShortcut(shortcut, { apple: this.#apple, names }));
  }
  /** The keys of an action as the value of `aria-keyshortcuts`. Empty if it has none. */
  ariaKeysOf(action) {
    return this.keysOf(action).map((shortcut) => ariaShortcut(shortcut, this.#apple)).join(" ");
  }
  getSnapshot() {
    return this.#snapshot;
  }
  onConnect() {
    const { host } = this;
    this.listen(host, "keydown", (event) => this.#key(event));
    let fullscreen = null;
    const leave = () => {
      fullscreen?.abort();
      fullscreen = null;
    };
    const follow = () => {
      const element = host.ownerDocument.fullscreenElement;
      leave();
      if (!element || !(element === host || host.contains(element))) return;
      fullscreen = new AbortController();
      host.ownerDocument.addEventListener(
        "keydown",
        (event) => {
          if (!event.composedPath().includes(host)) this.#key(event);
        },
        { signal: fullscreen.signal }
      );
    };
    this.listen(host, "fullscreenchange", follow);
    follow();
    this.cleanup(leave);
    this.cleanup(() => {
      this.#setRunning([]);
      this.#checked = false;
    });
    this.cleanup(
      this.#messages.follow(() => {
        this.#snapshot = { ...this.#snapshot };
        this.notify();
      })
    );
    this.#lint();
    if (this.#root?.firstElementChild) this.#template();
    const frame = requestAnimationFrame(() => this.#focus());
    this.cleanup(() => cancelAnimationFrame(frame));
  }
  onRefresh() {
    this.#template();
    this.#focus();
  }
  /** The shadow root, or null for a widget without one: the keys work there too. */
  get #root() {
    try {
      return this.root;
    } catch {
      return null;
    }
  }
  /** A reserved key is never delivered, whatever is declared. Say so once. */
  #lint() {
    for (const [name, action] of Object.entries(this.actions)) {
      const { shortcut } = action;
      for (const key of shortcut === void 0 ? [] : typeof shortcut === "string" ? [shortcut] : shortcut) {
        if (!isReservedShortcut(key)) continue;
        warnOnce(
          this.host.constructor,
          `shortcut-reserved:${key}`,
          `<${this.host.localName}>: the shortcut "${key}" of the action "${name}" is reserved for undo, redo and save in the editor and is ignored.`
        );
      }
    }
  }
  /** Brings the marked buttons up to date. */
  #template() {
    const root = this.#root;
    if (!root) return;
    for (const button of root.querySelectorAll("[data-ww-shortcut]")) {
      const keys = this.ariaKeysOf(button.dataset.wwShortcut);
      if (!keys) button.removeAttribute("aria-keyshortcuts");
      else if (button.getAttribute("aria-keyshortcuts") !== keys) button.setAttribute("aria-keyshortcuts", keys);
    }
  }
  /**
   * Checks, once, that the keys can arrive at all. Never before the widget
   * has rendered something other than styles: a widget that renders its
   * focusable stage later is not reported for the render before it.
   */
  #focus() {
    const { host } = this;
    const root = this.#root;
    if (!root || this.#checked || !this.connected) return;
    const elements = [...root.querySelectorAll("*")].filter((element) => !element.matches("style, link, template, script"));
    if (elements.length === 0) return;
    this.#checked = true;
    if (!Object.keys(this.actions).some((name) => this.keysOf(name).length)) return;
    const focusable = host.hasAttribute("tabindex") || elements.some((element) => element.matches(FOCUSABLE) || element.localName.includes("-"));
    if (focusable) return;
    warnOnce(
      host.constructor,
      "shortcut-focus",
      `<${host.localName}>: shortcuts are declared, but nothing in the widget can take the focus, so the keys never arrive. Give an element in the shadow root tabindex="0", for example the stage.`
    );
  }
  #key(event) {
    if (event.defaultPrevented || event.isComposing || event.key === "Process") return;
    const path = event.composedPath();
    const target = path[0];
    if (target instanceof Element && this.#elsewhere(target, path, event)) return;
    const host = this.host;
    for (const by of ["key", "code"]) {
      for (const name of Object.keys(this.actions)) {
        if (!this.keysOf(name).some((shortcut) => match(parse(shortcut), event, this.#apple) === by)) continue;
        const action = this.actions[name];
        const method = host[name];
        if (typeof method !== "function" || action.can && !can(this.host, action.can)) continue;
        if (!this.#snapshot.running.includes(name) && this.#run(name, method) === false) continue;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
  }
  /** Runs the action as one undo step. Returns what the method returned: `false` declines the key. */
  #run(name, method) {
    const { rendered } = this.#options;
    let value;
    const result = transaction(this.host, () => {
      value = method.call(this.host);
      if (value === false || !(value instanceof Promise) && !rendered) return value;
      return Promise.resolve(value).then(() => rendered?.());
    });
    if (!(value instanceof Promise)) return value;
    this.#setRunning([...this.#snapshot.running, name]);
    void result.finally(() => {
      if (this.connected) this.#setRunning(this.#snapshot.running.filter((other) => other !== name));
    });
    return value;
  }
  #setRunning(running) {
    if (running.length === 0 && this.#snapshot.running.length === 0) return;
    this.#snapshot = { running };
    this.notify();
  }
  /** True while the key belongs to something else: text entry, a control that uses the key itself, or a region with its own keys. */
  #elsewhere(target, path, event) {
    const end = path.indexOf(this.host);
    const inside = path.slice(0, Math.max(end, 0)).filter((node) => node instanceof Element);
    const marked = inside.find((element) => element.hasAttribute("data-ww-shortcuts"))?.getAttribute("data-ww-shortcuts");
    if (marked === "off") return true;
    if (this.#typing(target, inside)) return true;
    if (marked !== "on" && isOpaque(target, this.host)) return true;
    return usedByControl(target, event, this.host);
  }
  /** True while the key belongs to text entry: a field, or authored text that the author is editing. */
  #typing(target, inside) {
    const name = target.localName;
    if (name === "textarea" || name === "select" || inside.some((element) => element.matches(TEXT_ROLES))) return true;
    if (name === "input") return !NO_TEXT_INPUT.test(target.type);
    if (!(target instanceof HTMLElement) || !target.isContentEditable) return false;
    if (inside.some((element) => element instanceof HTMLElement && element.hasAttribute("contenteditable") && element.contentEditable !== "false")) return true;
    const anchor = this.host.ownerDocument.getSelection()?.anchorNode;
    return !!anchor && anchor !== this.host && this.host.contains(anchor);
  }
}
export {
  ShortcutsCore,
  ariaShortcut,
  formatShortcut,
  isApple,
  isReservedShortcut,
  matchesShortcut,
  shortcutsMessages2 as shortcutsMessages
};
