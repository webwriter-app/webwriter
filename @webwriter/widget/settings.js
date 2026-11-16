import { ModuleCore, warnOnce } from "./base.js";
import { followLanguage, Messages } from "./messages.js";
import { settingsMessages } from "./messages/settings/index.js";
import { can, requestPermissions } from "./permissions.js";
import { transaction } from "./transaction.js";
import { settingsMessages as settingsMessages2 } from "./messages/settings/index.js";
const TEXTS = ["label", "description", "placeholder"];
const computes = (choice) => typeof choice.label === "function" || typeof choice.description === "function" || !!choice.children?.some(computes);
function settingKind(declaration) {
  const { type } = declaration;
  if (type === Boolean || type === "boolean") return "boolean";
  if (type === Number || type === "number") return "number";
  return type === "select" && declaration.multiple === true ? "list" : "string";
}
const NO_CHOICES = Object.freeze([]);
function settingDefault(declaration) {
  const kind = settingKind(declaration);
  if (declaration.default === void 0) return kind === "boolean" ? false : kind === "list" ? NO_CHOICES : void 0;
  return accept(declaration, declaration.default)?.value ?? declaration.default;
}
const negative = (declaration) => settingKind(declaration) === "boolean" && declaration.default === true;
function settingAttribute(name, declaration) {
  const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return declaration.attribute ?? (negative(declaration) ? `no-${kebab}` : kebab);
}
function settingChoices(declaration) {
  const leaves = (choices) => choices.flatMap((choice) => choice.children ? leaves(choice.children) : choice.value === void 0 ? [] : [choice]);
  return leaves(declaration.options ?? []);
}
function sameSetting(a, b) {
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
const DATE = String.raw`\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])`;
const TIME = String.raw`([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?`;
const FORMATS = {
  date: new RegExp(`^${DATE}$`),
  time: new RegExp(`^${TIME}$`),
  "datetime-local": new RegExp(`^${DATE}T${TIME}$`),
  color: /^#[0-9a-f]{6}$/
};
function fitsText(declaration, text) {
  const { type, pattern, minlength, maxlength } = declaration;
  if (typeof type === "string" && FORMATS[type] && !FORMATS[type].test(text)) return false;
  if (minlength !== void 0 && text.length < minlength) return false;
  if (maxlength !== void 0 && text.length > maxlength) return false;
  if (type === "select") {
    const listed = settingChoices(declaration);
    if (listed.length && !listed.some((choice) => choice.value === text)) return false;
  }
  if (pattern === void 0) return true;
  try {
    return new RegExp(`^(?:${pattern})$`, "v").test(text);
  } catch {
    return true;
  }
}
function limitNumber(declaration, number) {
  const { steps, control } = declaration;
  const min = declaration.min ?? (control === "duration" ? 0 : -Infinity);
  const limited = Math.min(Math.max(number, min), declaration.max ?? Infinity);
  if (!steps?.length) return limited;
  return steps.reduce((nearest, step) => Math.abs(step - limited) < Math.abs(nearest - limited) ? step : nearest);
}
function accept(declaration, value) {
  switch (settingKind(declaration)) {
    case "boolean":
      return typeof value === "boolean" ? { value } : null;
    case "number": {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      return Number.isFinite(number) ? { value: limitNumber(declaration, number) } : null;
    }
    case "list": {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
      const listed = settingChoices(declaration).map((choice) => choice.value);
      if (listed.length && !value.every((item) => listed.includes(item))) return null;
      const chosen = listed.length ? listed.filter((item) => value.includes(item)) : [...new Set(value)];
      return { value: Object.freeze(chosen) };
    }
    default: {
      if (typeof value !== "string" && typeof value !== "number") return null;
      const text = declaration.type === "color" ? String(value).toLowerCase() : String(value);
      return fitsText(declaration, text) ? { value: text } : null;
    }
  }
}
const isReset = (value) => value === null || value === void 0 || value === "";
function normalizeSetting(declaration, value, fallback = settingDefault(declaration)) {
  if (isReset(value)) return settingDefault(declaration);
  const accepted = accept(declaration, value);
  return accepted ? accepted.value : fallback;
}
function parseSetting(declaration, attribute) {
  const kind = settingKind(declaration);
  if (kind === "boolean") return attribute !== null !== negative(declaration);
  if (kind !== "list" || isReset(attribute)) return normalizeSetting(declaration, attribute);
  let items;
  try {
    items = JSON.parse(attribute);
  } catch {
    return settingDefault(declaration);
  }
  if (!Array.isArray(items)) return settingDefault(declaration);
  const listed = settingChoices(declaration).map((choice) => choice.value);
  return normalizeSetting(
    declaration,
    items.filter((item) => typeof item === "string" && (!listed.length || listed.includes(item)))
  );
}
function serializeSetting(declaration, value) {
  const normalized = normalizeSetting(declaration, value);
  if (normalized === void 0 || sameSetting(normalized, settingDefault(declaration))) return null;
  if (typeof normalized === "boolean") return "";
  return typeof normalized === "object" ? JSON.stringify(normalized) : String(normalized);
}
function localized(text, locale) {
  if (typeof text !== "object") return text;
  const keys = Object.keys(text);
  const find = (tag) => keys.find((key2) => key2.toLowerCase() === tag);
  const key = find(locale.toLowerCase()) ?? find(locale.toLowerCase().split("-")[0]) ?? "_";
  return text[key] ?? text._;
}
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const [whole, fraction = ""] = seconds.toFixed(3).split(".");
  const total = Number(whole);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const rest = fraction.replace(/0+$/, "");
  const head = hours ? `${hours}:${String(minutes).padStart(2, "0")}` : String(minutes);
  return `${head}:${String(total % 60).padStart(2, "0")}${rest ? `.${rest}` : ""}`;
}
function parseDuration(text) {
  const parts = text.trim().split(":");
  const fits = (part, index) => (index === parts.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/).test(part);
  if (parts.length > 3 || !parts.every(fits)) return void 0;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((number) => number >= 60)) return void 0;
  return numbers.reduce((total, part) => total * 60 + part, 0);
}
const TEXT_ENTRY = /^(text|search|url|tel|email|password|number|date|time|datetime-local|textarea)$/;
const PLAIN_TEXT = /^(text|search|url|tel|email|password|textarea)$/;
const isControl = (element) => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
const showsDuration = (control, declaration) => declaration.control === "duration" && PLAIN_TEXT.test(control.type);
const stepsThrough = (control, declaration) => control.type === "range" && !!declaration.steps?.length;
const isChoice = (control, kind) => control.type === "radio" || control.type === "checkbox" && kind !== "boolean";
function setAttribute(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}
function read(control, declaration, current, commit) {
  const kind = settingKind(declaration);
  if (control instanceof HTMLSelectElement && kind === "list") return { value: [...control.selectedOptions].map((option) => option.value) };
  if (control.type === "checkbox") {
    const input = control;
    if (kind === "boolean") return { value: input.checked };
    if (kind !== "list") return input.checked ? { value: input.value } : { value: null };
    const others = (Array.isArray(current) ? current : []).filter((item) => item !== input.value);
    return { value: input.checked ? [...others, input.value] : others };
  }
  if (control.type === "radio") return control.checked ? { value: control.value } : void 0;
  if (kind === "list") return void 0;
  if (kind !== "number") return { value: control.value };
  if (control.value.trim() === "") return commit ? { value: null } : void 0;
  if (stepsThrough(control, declaration)) return { value: declaration.steps[Number(control.value)] };
  const number = showsDuration(control, declaration) ? parseDuration(control.value) : Number(control.value);
  return number === void 0 || Number.isNaN(number) ? void 0 : { value: number };
}
function write(control, declaration, value) {
  const kind = settingKind(declaration);
  const list = Array.isArray(value) ? value : [];
  if (control instanceof HTMLSelectElement && kind === "list") {
    for (const option of control.options) option.selected = list.includes(option.value);
  } else if (control.type === "checkbox" || control.type === "radio") {
    const input = control;
    input.checked = kind === "boolean" ? value === true : kind === "list" ? list.includes(input.value) : input.value === String(value ?? "");
  } else {
    let text = String(value ?? "");
    if (typeof value === "number" && stepsThrough(control, declaration)) text = String(declaration.steps.indexOf(value));
    else if (typeof value === "number" && showsDuration(control, declaration)) text = formatDuration(value);
    if (control.value !== text) control.value = text;
  }
}
function hasLabel(control) {
  if (control.hasAttribute("aria-labelledby")) return true;
  for (const label of control.labels ?? []) {
    const walker = label.ownerDocument.createTreeWalker(label, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!control.contains(node) && node.nodeValue?.trim()) return true;
    }
  }
  return false;
}
const UNSUPPORTED = /* @__PURE__ */ new Set([Object, Array, "object", "array"]);
class SettingsCore extends ModuleCore {
  #options;
  #messages;
  #snapshot = { values: {}, disabled: {} };
  #declared = "";
  /** The last attribute text and its value per setting, so that a list keeps its identity between reads. */
  #parsed = /* @__PURE__ */ new Map();
  /** What the module wrote onto template elements, by attribute. Anything else there belongs to the template. */
  #written = /* @__PURE__ */ new WeakMap();
  /** The open undo step of an entry in a bound control. */
  #entry = null;
  #swatches = /* @__PURE__ */ new Map();
  #checkedMarks = false;
  constructor(host, options = {}) {
    super(host, options);
    this.#options = options;
    this.#messages = new Messages(host, settingsMessages, options.messages);
  }
  /** The declarations: the `declarations` option, or the host class's `static settings`. */
  get declarations() {
    return this.#options.declarations ?? this.host.constructor.settings ?? {};
  }
  /** The widget's language: the nearest `lang`, through shadow roots. Empty if none is set. */
  get language() {
    return this.#messages.language;
  }
  /** The current value, read from the attribute. */
  get(name) {
    const declaration = this.declarations[name];
    if (!declaration) return void 0;
    const text = this.host.getAttribute(settingAttribute(name, declaration));
    const known = this.#parsed.get(name);
    if (known && known.text === text) return known.value;
    const value = parseSetting(declaration, text);
    this.#parsed.set(name, { text, value });
    return value;
  }
  /**
   * Writes the attribute, as one undo step. Returns false for a value the
   * setting refuses, which changes nothing. A setting that is turned off by
   * `disabled` still takes a write from code.
   */
  set(name, value) {
    const declaration = this.declarations[name];
    if (!declaration) return false;
    const accepted = isReset(value) ? { value: settingDefault(declaration) } : accept(declaration, value);
    if (!accepted) return false;
    if (sameSetting(accepted.value, this.get(name))) return true;
    const attribute = settingAttribute(name, declaration);
    const text = serializeSetting(declaration, accepted.value);
    const { rendered } = this.#options;
    void transaction(this.host, () => {
      if (text === null) this.host.removeAttribute(attribute);
      else this.host.setAttribute(attribute, text);
      return rendered?.();
    });
    return true;
  }
  /** True, or the reason, while the setting's `disabled` function turns it off. */
  disabledOf(name) {
    const disabled = this.declarations[name]?.disabled;
    return disabled?.(this.host) || false;
  }
  /** The label of a setting, or of one of its choices, in the widget's language. Without a declared label it is the name or the value. */
  labelOf(name, choice) {
    const declaration = this.declarations[name];
    if (choice === void 0) return localized(this.#text(declaration?.label), this.language) ?? name;
    const listed = declaration ? settingChoices(declaration).find((leaf) => leaf.value === choice) : void 0;
    return localized(this.#text(listed?.label), this.language) ?? choice;
  }
  /** A text as the editor takes it: a function is asked with the widget. */
  #text(text) {
    return typeof text === "function" ? text(this.host) : text;
  }
  /** The choices with their texts answered for the widget. The declared list itself where none is a function. */
  #choices(choices) {
    if (!choices.some(computes)) return choices;
    return choices.map(({ label, description, children, ...rest }) => ({
      ...rest,
      ...label === void 0 ? {} : { label: this.#text(label) },
      ...description === void 0 ? {} : { description: this.#text(description) },
      ...children ? { children: this.#choices(children) } : {}
    }));
  }
  /** The texts and choices of a declaration that are functions, answered for the widget. Absent fields stay absent. */
  #computed(declaration) {
    const texts = TEXTS.filter((field) => typeof declaration[field] === "function").map((field) => [field, this.#text(declaration[field])]);
    const choices = declaration.options?.some(computes) ? [["options", this.#choices(declaration.options)]] : [];
    return Object.fromEntries([...texts, ...choices]);
  }
  /**
   * The editor's option declarations (`options` on the widget). Each names
   * its attribute. A boolean that defaults to true is stored by its negative
   * attribute and declared with `inverted: true` (see the `negativeBooleans`
   * option for the other form).
   */
  editorOptions() {
    const property = this.#options.negativeBooleans === "property";
    const entries = Object.entries(this.declarations).map(([name, declaration]) => {
      const { default: _default, disabled: _disabled, ...passed } = declaration;
      const off = this.disabledOf(name);
      const attribute = settingAttribute(name, declaration);
      const stored = !negative(declaration) ? { attribute } : property ? { attribute: false } : { attribute, inverted: true };
      const turnedOff = !off ? {} : off === true ? { disabled: true } : { disabled: true, disabledReason: off };
      return [name, { ...passed, ...this.#computed(declaration), ...stored, ...turnedOff }];
    });
    return Object.fromEntries(entries);
  }
  /**
   * Defines one accessor per setting on `target`, backed by the attribute.
   * For hosts whose library does not make the properties itself.
   */
  defineProperties(target = this.host) {
    for (const name of Object.keys(this.declarations)) {
      Object.defineProperty(target, name, { get: () => this.get(name), set: (value) => void this.set(name, value), configurable: true, enumerable: true });
    }
  }
  getSnapshot() {
    return this.#snapshot;
  }
  onConnect() {
    this.#lint();
    const observer = new MutationObserver(() => this.#update());
    observer.observe(this.host, { attributes: true });
    this.cleanup(() => observer.disconnect());
    this.cleanup(followLanguage(this.host, () => this.#update()));
    this.cleanup(this.#messages.follow(() => this.#update()));
    this.listen(this.root, "input", (event) => this.#input(event, false));
    this.listen(this.root, "change", (event) => this.#input(event, true));
    this.listen(this.root, "focusout", (event) => {
      if (this.#entry && event.target === this.#entry.control) this.#commit(this.#entry.control);
    });
    this.cleanup(() => {
      this.#end();
      for (const list of this.#swatches.values()) list.remove();
      this.#swatches.clear();
      this.#parsed.clear();
      this.#checkedMarks = false;
    });
    this.#declared = this.#signature();
    this.#update();
  }
  onRefresh() {
    this.#update();
  }
  /** Development warnings for declarations that cannot work. */
  #lint() {
    const { host } = this;
    const owner = host.constructor;
    const groups = host.optionGroups ?? owner.optionGroups ?? {};
    for (const [name, declaration] of Object.entries(this.declarations)) {
      const own = Object.getOwnPropertyDescriptor(host, name);
      if (own && "value" in own) {
        warnOnce(
          owner,
          `setting-shadowed:${name}`,
          `<${host.localName}>: a class field named "${name}" shadows the setting of that name. Remove the field; the setting provides the property.`
        );
      }
      if (UNSUPPORTED.has(declaration.type)) {
        warnOnce(
          owner,
          `setting-type:${name}`,
          `<${host.localName}>: the setting "${name}" is an object or an array. Structured content belongs in the data block or in child elements; the setting is treated as text.`
        );
      }
      if (declaration.group !== void 0 && !Object.hasOwn(groups, declaration.group)) {
        warnOnce(
          owner,
          `setting-group:${declaration.group}`,
          `<${host.localName}>: the setting "${name}" names the group "${declaration.group}", which is not declared in static optionGroups.`
        );
      }
    }
  }
  /** What the editor would have to read again: the `disabled` results, the language and the texts that are functions. */
  #signature() {
    const declared = Object.entries(this.declarations);
    return JSON.stringify([this.language, declared.map(([name]) => this.disabledOf(name)), declared.map(([, declaration]) => this.#computed(declaration))]);
  }
  #update() {
    const names = Object.keys(this.declarations);
    const values = Object.fromEntries(names.map((name) => [name, this.get(name)]));
    const disabled = Object.fromEntries(names.map((name) => [name, this.disabledOf(name)]).filter(([, off]) => off));
    const before = this.#snapshot;
    const changed = !names.every((name) => name in before.values && sameSetting(values[name], before.values[name])) || JSON.stringify(disabled) !== JSON.stringify(before.disabled);
    if (changed) this.#snapshot = { values, disabled };
    const declared = this.#signature();
    if (declared !== this.#declared) {
      this.#declared = declared;
      this.host.dispatchEvent(new Event("optionschange", { bubbles: true }));
    }
    const { root } = this;
    for (const element of root.querySelectorAll("[data-ww-setting-label]")) this.#caption(element);
    const controls = [...root.querySelectorAll("[data-ww-setting]")].filter(isControl);
    for (const control of controls) this.#show(control, false);
    this.#checkMarks(controls);
    if (changed) this.notify();
  }
  /** `data-ww-can` around a bound control is hidden by Permissions. Without it the control stays visible and only refuses. */
  #checkMarks(controls) {
    if (this.#checkedMarks || !controls.some((control) => control.closest("[data-ww-can]"))) return;
    this.#checkedMarks = true;
    if (requestPermissions(this.host)) return;
    warnOnce(
      this.host.constructor,
      "setting-can",
      `<${this.host.localName}>: a bound control is marked data-ww-can, but the widget has no Permissions. The control refuses input a reader may not make, and stays visible. Add Permissions to hide it.`
    );
  }
  /**
   * Sets an attribute on a template element where the template has none of
   * its own; null removes what the module wrote before.
   */
  #own(element, attribute, value) {
    const mine = this.#written.get(element)?.get(attribute);
    const current = element.getAttribute(attribute);
    if (current !== null && current !== mine) return;
    if (value === null) {
      if (current !== null) element.removeAttribute(attribute);
      this.#written.get(element)?.delete(attribute);
      return;
    }
    setAttribute(element, attribute, value);
    const written = this.#written.get(element) ?? this.#written.set(element, /* @__PURE__ */ new Map()).get(element);
    written.set(attribute, value);
  }
  /** Fills an element marked `data-ww-setting-label` that the template left empty. */
  #caption(element) {
    const [name, choice] = element.dataset.wwSettingLabel.split("=", 2);
    if (!this.declarations[name]) return;
    const mine = this.#written.get(element)?.get("text");
    if (element.childNodes.length && element.textContent !== mine) return;
    const text = this.labelOf(name, choice);
    if (element.textContent !== text) element.textContent = text;
    const written = this.#written.get(element) ?? this.#written.set(element, /* @__PURE__ */ new Map()).get(element);
    written.set("text", text);
  }
  /** Value, limits, name and enabled state of one bound control. */
  #show(control, commit) {
    const name = control.dataset.wwSetting;
    const declaration = this.declarations[name];
    if (!declaration) {
      warnOnce(this.host.constructor, `setting-unknown:${name}`, `<${this.host.localName}>: data-ww-setting="${name}" names no declared setting.`);
      return;
    }
    const kind = settingKind(declaration);
    this.#limit(control, declaration, kind);
    if (control instanceof HTMLSelectElement) this.#fill(control, declaration);
    if (control.type === "color") this.#suggest(control, name, declaration);
    const typing = !commit && TEXT_ENTRY.test(control.type) && this.root.activeElement === control;
    if (!typing) {
      write(control, declaration, this.get(name));
      control.setCustomValidity("");
    }
    const off = this.disabledOf(name);
    if (control.disabled !== !!off) control.disabled = !!off;
    const reason = off && off !== true ? localized(off, this.language) ?? null : null;
    this.#own(control, "aria-description", reason);
    this.#own(control, "title", reason);
    const label = hasLabel(control) ? null : isChoice(control, kind) ? this.labelOf(name, control.value) : this.labelOf(name);
    this.#own(control, "aria-label", label);
  }
  /** The limits of the declaration, as the attributes of the control that enforce them natively. */
  #limit(control, declaration, kind) {
    if (kind === "number" && (control.type === "number" || control.type === "range")) {
      const { steps } = declaration;
      const through = stepsThrough(control, declaration);
      const limits = through ? { min: 0, max: steps.length - 1, step: 1 } : { min: declaration.min, max: declaration.max, step: declaration.step };
      for (const [limit, number] of Object.entries(limits)) {
        if (number !== void 0) setAttribute(control, limit, String(number));
      }
      if (limits.step === void 0) this.#own(control, "step", "any");
      if (control.type !== "range") return;
      const value = this.get(control.dataset.wwSetting);
      const text = typeof value !== "number" ? null : declaration.control === "duration" ? formatDuration(value) : declaration.unit ? `${value} ${declaration.unit}` : through ? String(value) : null;
      this.#own(control, "aria-valuetext", text);
    } else if (kind === "string" && PLAIN_TEXT.test(control.type)) {
      const { pattern, minlength, maxlength } = declaration;
      if (pattern !== void 0 && control.localName === "input") setAttribute(control, "pattern", pattern);
      if (minlength !== void 0) setAttribute(control, "minlength", String(minlength));
      if (maxlength !== void 0) setAttribute(control, "maxlength", String(maxlength));
    }
  }
  /** An empty `<select>` gets the declared choices, with one `<optgroup>` per branch, or the `steps` of a number. */
  #fill(select, declaration) {
    if ([...select.children].some((child) => !child.hasAttribute("data-ww-choice"))) return;
    const { language } = this;
    const label = (choice) => localized(choice.label, language) ?? choice.value ?? "";
    const unit = declaration.unit ? ` ${declaration.unit}` : "";
    const choices = settingKind(declaration) === "number" ? (declaration.steps ?? []).map((step) => ({ value: String(step), label: `${step}${unit}` })) : this.#choices(declaration.options ?? []);
    const leaves = (branch) => branch.children ? branch.children.flatMap(leaves) : branch.value === void 0 ? [] : [branch];
    const wanted = JSON.stringify([language, choices]);
    if (this.#written.get(select)?.get("choices") === wanted && select.options.length === choices.flatMap(leaves).length) return;
    const document = select.ownerDocument;
    const option = (choice) => {
      const element = document.createElement("option");
      element.setAttribute("data-ww-choice", "");
      element.value = choice.value;
      element.textContent = label(choice);
      return element;
    };
    select.replaceChildren(
      ...choices.flatMap((choice) => {
        if (!choice.children) return choice.value === void 0 ? [] : [option(choice)];
        const group = document.createElement("optgroup");
        group.setAttribute("data-ww-choice", "");
        group.label = label(choice);
        group.append(...leaves(choice).map(option));
        return [group];
      })
    );
    const written = this.#written.get(select) ?? this.#written.set(select, /* @__PURE__ */ new Map()).get(select);
    written.set("choices", wanted);
  }
  /** The `swatches` of a color become the suggestions of its color field. */
  #suggest(control, name, declaration) {
    const colors = declaration.swatches ?? [];
    const id = `ww-swatches-${name}`;
    const current = control.getAttribute("list");
    if (current !== null && current !== this.#written.get(control)?.get("list")) return;
    let list = this.#swatches.get(name);
    if (!colors.length) {
      list?.remove();
      this.#swatches.delete(name);
      this.#own(control, "list", null);
      return;
    }
    if (!list) {
      list = control.ownerDocument.createElement("datalist");
      list.id = id;
      list.setAttribute("data-ww-swatches", "");
      this.#swatches.set(name, list);
    }
    if ([...list.options].map((option) => option.value).join() !== colors.join()) {
      list.replaceChildren(
        ...colors.map((color) => {
          const option = control.ownerDocument.createElement("option");
          option.value = color;
          return option;
        })
      );
    }
    if (list.parentNode !== this.root) this.root.append(list);
    this.#own(control, "list", id);
  }
  #input(event, commit) {
    const target = event.target.closest?.("[data-ww-setting]");
    if (!isControl(target)) return;
    const name = target.dataset.wwSetting;
    const declaration = this.declarations[name];
    if (!declaration) return;
    const permission = target.closest("[data-ww-can]")?.dataset.wwCan;
    if (this.disabledOf(name) || permission && !can(this.host, permission)) {
      if (this.#entry?.control === target) this.#end();
      write(target, declaration, this.get(name));
      return;
    }
    const entry = read(target, declaration, this.get(name), commit);
    if (entry) {
      this.#begin(target);
      const taken = this.set(name, entry.value);
      target.setCustomValidity(taken ? "" : this.#messages.current.invalid);
    } else if (settingKind(declaration) === "number" && target.value.trim() !== "" && showsDuration(target, declaration)) {
      target.setCustomValidity(this.#messages.current.invalidDuration);
    }
    if (commit) this.#commit(target);
  }
  /** Opens the undo step of an entry, or keeps the open one of the same control alive. */
  #begin(control) {
    if (this.#entry && this.#entry.control !== control) this.#end();
    if (!this.#entry) {
      let close;
      void transaction(this.host, () => new Promise((done) => close = done));
      this.#entry = { control, close, timer: void 0 };
    }
    clearTimeout(this.#entry.timer);
    this.#entry.timer = setTimeout(() => this.#end(), this.#options.entryTimeout ?? 5e3);
  }
  /** Ends the entry and shows the value that was really stored, for example after it was limited. */
  #commit(control) {
    this.#end();
    const name = control.dataset.wwSetting;
    for (const other of this.root.querySelectorAll(`[data-ww-setting]`)) {
      if (isControl(other) && other.dataset.wwSetting === name) this.#show(other, true);
    }
  }
  #end() {
    const entry = this.#entry;
    if (!entry) return;
    this.#entry = null;
    clearTimeout(entry.timer);
    const rendered = this.connected ? this.#options.rendered?.() : void 0;
    if (rendered) void rendered.then(entry.close, entry.close);
    else entry.close();
  }
}
export {
  SettingsCore,
  formatDuration,
  localized,
  normalizeSetting,
  parseDuration,
  parseSetting,
  sameSetting,
  serializeSetting,
  settingAttribute,
  settingChoices,
  settingDefault,
  settingKind,
  settingsMessages2 as settingsMessages
};
