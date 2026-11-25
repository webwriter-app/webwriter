import { documentLanguageName, orderedLanguageOptions } from "./language-options.js";
const HTMLElementBase = globalThis.HTMLElement ?? class {
};
class LanguagePicker extends HTMLElementBase {
  static observedAttributes = ["label", "value", "placeholder", "disabled"];
  #select;
  #placeholder;
  #unlisted;
  #languages = /* @__PURE__ */ new Map();
  constructor() {
    super();
    const root = this.attachShadow({ mode: "open", delegatesFocus: true });
    const document = this.ownerDocument;
    const style = document.createElement("style");
    style.textContent = `
      :host {display: inline-block; max-inline-size: 100%;}
      :host([hidden]) {display: none;}
      select {box-sizing: border-box; max-inline-size: 100%; font: inherit;}
    `;
    this.#select = document.createElement("select");
    this.#select.setAttribute("part", "control");
    this.#placeholder = document.createElement("option");
    this.#placeholder.value = "";
    this.#unlisted = document.createElement("option");
    this.#select.append(this.#placeholder);
    for (const { value, label } of orderedLanguageOptions(document.defaultView?.navigator.languages)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      this.#languages.set(value.toLowerCase(), value);
      this.#select.append(option);
    }
    this.#select.addEventListener("change", (event) => {
      event.stopPropagation();
      if (this.disabled) return;
      this.value = this.#select.value;
      this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    });
    root.append(style, this.#select);
  }
  get label() {
    return this.getAttribute("label") ?? "Language";
  }
  set label(value) {
    this.setAttribute("label", value);
  }
  get value() {
    return this.getAttribute("value") ?? "";
  }
  set value(value) {
    if (value) this.setAttribute("value", value);
    else this.removeAttribute("value");
  }
  get placeholder() {
    return this.getAttribute("placeholder") ?? "Inherit language";
  }
  set placeholder(value) {
    if (value === void 0) this.removeAttribute("placeholder");
    else this.setAttribute("placeholder", value);
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(value) {
    this.toggleAttribute("disabled", value);
  }
  connectedCallback() {
    for (const name of LanguagePicker.observedAttributes) {
      if (!Object.hasOwn(this, name)) continue;
      const value = Reflect.get(this, name);
      Reflect.deleteProperty(this, name);
      Reflect.set(this, name, value);
    }
    this.#select.setAttribute("aria-label", this.label);
    this.#select.disabled = this.disabled;
    this.#placeholder.textContent = this.placeholder;
    this.#selectValue();
  }
  attributeChangedCallback(name, before, after) {
    if (before === after) return;
    if (name === "value") this.#selectValue();
    else if (name === "label") this.#select.setAttribute("aria-label", this.label);
    else if (name === "disabled") this.#select.disabled = this.disabled;
    else if (name === "placeholder") this.#placeholder.textContent = this.placeholder;
  }
  #selectValue() {
    const value = this.value;
    const listed = this.#languages.get(value.toLowerCase());
    if (value && !listed) {
      this.#unlisted.value = value;
      this.#unlisted.textContent = documentLanguageName(value);
      this.#placeholder.after(this.#unlisted);
    } else this.#unlisted.remove();
    this.#select.value = listed ?? value;
  }
}
function defineLanguagePicker() {
  const registry = globalThis.customElements;
  if (registry && !registry.get("ww-language-picker")) registry.define("ww-language-picker", LanguagePicker);
}
export {
  LanguagePicker,
  defineLanguagePicker
};
