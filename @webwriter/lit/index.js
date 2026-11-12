// index.ts
import { LitElement as LitElement2, adoptStyles } from "lit";
import { SignalWatcher } from "@lit-labs/signals";
export * from "@lit-labs/signals";

// widget-drawer.ts
import { LitElement, css as css2, html as html2, nothing as nothing2 } from "lit";
import { live } from "lit/directives/live.js";

// widget-option-controls.ts
import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";

// widget-options.ts
var widgetOptionTypes = [
  "boolean",
  "string",
  "number",
  "date",
  "datetime-local",
  "email",
  "password",
  "tel",
  "time",
  "url",
  "object",
  "array",
  "color",
  "select",
  "reference"
];
var widgetOptionControls = ["input", "range", "duration", "checkbox", "switch", "select", "radio", "segmented", "tree"];
var fileExtension = /^\.[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/i;
var mediaType = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;
function isWidgetFileFormat(value) {
  return typeof value === "string" && (fileExtension.test(value) || mediaType.test(value));
}
function matchesWidgetFileFormat(file, format) {
  const key = format.toLowerCase();
  return key.startsWith(".") ? file.name.toLowerCase().endsWith(key) : file.type.split(";", 1)[0].trim().toLowerCase() === key;
}
function formatWidgetDuration(value) {
  if (!Number.isFinite(value) || value < 0) return "";
  const [whole, fraction = ""] = value.toFixed(9).split(".");
  const seconds = Number(whole);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const suffix = fraction.replace(/0+$/, "");
  return `${hours ? `${hours}:${String(minutes).padStart(2, "0")}` : minutes}:${String(seconds % 60).padStart(2, "0")}${suffix ? `.${suffix}` : ""}`;
}
function parseWidgetDuration(text2) {
  const parts = text2.trim().split(":");
  if (parts.length > 3 || !parts.every((part, index) => (index === parts.length - 1 ? /^\d+(?:\.\d+)?$/ : /^\d+$/).test(part))) return void 0;
  const numbers = parts.map(Number);
  if (numbers.slice(1).some((value2) => value2 >= 60)) return void 0;
  const value = numbers.reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(value) ? value : void 0;
}
var isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var optionalNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : void 0;
var optionalString = (value) => typeof value === "string" ? value : void 0;
var text = (value, locale) => {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return void 0;
  const entries = Object.entries(value).filter((entry) => typeof entry[1] === "string");
  return localizedText(Object.fromEntries(entries), locale);
};
var titleCase = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll(/[-_]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
function widgetOptionType(type) {
  if (type === Boolean) return "boolean";
  if (type === Number) return "number";
  if (type === Array) return "array";
  if (type === Object) return "object";
  if (type === String || type === void 0) return "string";
  return widgetOptionTypes.includes(type) ? type : "string";
}
function widgetOptionAttribute(name, declaration) {
  if (declaration.attribute === false) return null;
  if (typeof declaration.attribute === "string") return declaration.attribute;
  return name.toLowerCase();
}
function widgetOptionValue(value, depth = 0) {
  if (value === null || value === void 0 || depth > 8) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 1e3).map((item) => widgetOptionValue(item, depth + 1));
  if (isRecord(value) && Object.getPrototypeOf(value) === Object.prototype || isRecord(value) && Object.getPrototypeOf(value) === null) {
    return Object.fromEntries(Object.entries(value).slice(0, 1e3).map(([key, item]) => [key, widgetOptionValue(item, depth + 1)]));
  }
  return null;
}
var availability = (decl, locale) => ({
  ...decl.hidden === true ? { hidden: true } : {},
  ...decl.disabled === true ? { disabled: true } : {},
  ...text(decl.disabledReason, locale) ? { disabledReason: text(decl.disabledReason, locale) } : {}
});
function widgetOptionGroupState(name, declaration, locale) {
  const decl = isRecord(declaration) ? declaration : {};
  return {
    name,
    label: text(decl.label, locale) ?? titleCase(name),
    ...text(decl.description, locale) ? { description: text(decl.description, locale) } : {},
    ...decl.collapsible === true ? { collapsible: true } : {},
    ...decl.collapsed === true ? { collapsed: true } : {},
    ...decl.advanced === true ? { advanced: true } : {}
  };
}
var compatibleControl = (type, control, multiple) => type === "boolean" ? control === "checkbox" || control === "switch" : type === "number" ? control === "input" || control === "range" || control === "duration" : type === "select" ? control === "select" || multiple === true && control === "tree" || !multiple && (control === "radio" || control === "segmented") : false;
function optionTree(entries, locale) {
  const values = /* @__PURE__ */ new Set();
  let remaining = 1e3;
  const visit = (entries2, depth = 0) => depth > 8 ? [] : entries2.slice(0, Math.max(0, remaining)).flatMap((entry) => {
    if (remaining-- <= 0 || !isRecord(entry)) return [];
    const label = text(entry.label, locale) ?? optionalString(entry.value) ?? "Group";
    const description = text(entry.description, locale);
    const common = { label, ...description ? { description } : {} };
    if (Array.isArray(entry.children)) {
      const children = visit(entry.children, depth + 1);
      return children.length ? [{ ...common, children }] : [];
    }
    if (typeof entry.value !== "string" || values.has(entry.value)) return [];
    values.add(entry.value);
    return [{ ...common, value: entry.value }];
  });
  return visit(entries);
}
function widgetTreeLeaves(nodes) {
  return nodes.flatMap((node) => node.children ? widgetTreeLeaves(node.children) : typeof node.value === "string" ? [{ value: node.value, label: node.label, ...node.description ? { description: node.description } : {} }] : []);
}
function widgetOptionState(name, declaration, value, locale) {
  const decl = isRecord(declaration) ? declaration : {};
  const type = widgetOptionType(decl.type);
  const tree = type === "select" && decl.multiple === true && decl.control === "tree" ? optionTree(Array.isArray(decl.options) ? decl.options : [], locale) : void 0;
  const choices = tree ? widgetTreeLeaves(tree) : Array.isArray(decl.options) ? decl.options.flatMap((choice) => isRecord(choice) && typeof choice.value === "string" ? [{
    value: choice.value,
    label: text(choice.label, locale) ?? choice.value,
    ...text(choice.description, locale) ? { description: text(choice.description, locale) } : {}
  }] : []) : void 0;
  const state = {
    ...availability(decl, locale),
    name,
    type,
    label: text(decl.label, locale) ?? titleCase(name),
    attribute: widgetOptionAttribute(name, decl),
    value: widgetOptionValue(value),
    description: text(decl.description, locale),
    placeholder: text(decl.placeholder, locale),
    multiline: decl.multiline === true || void 0,
    min: optionalNumber(decl.min),
    max: optionalNumber(decl.max),
    step: optionalNumber(decl.step),
    pattern: optionalString(decl.pattern),
    minlength: optionalNumber(decl.minlength),
    maxlength: optionalNumber(decl.maxlength),
    swatches: Array.isArray(decl.swatches) ? decl.swatches.filter((swatch) => typeof swatch === "string") : void 0,
    multiple: decl.multiple === true || void 0,
    choices,
    tree,
    selector: type === "reference" ? optionalString(decl.selector) : void 0,
    excludeSelf: type === "reference" && typeof decl.excludeSelf === "boolean" ? decl.excludeSelf : void 0,
    group: optionalString(decl.group),
    control: compatibleControl(type, decl.control, decl.multiple) ? decl.control : void 0,
    unit: optionalString(decl.unit),
    steps: type === "number" && Array.isArray(decl.steps) ? [...new Set(decl.steps.filter((step) => optionalNumber(step) !== void 0))].sort((a, b) => a - b) : void 0,
    readOnly: decl.readOnly === true || void 0
  };
  return Object.fromEntries(Object.entries(state).filter(([, item]) => item !== void 0));
}
function widgetActionState(name, declaration, locale) {
  const decl = isRecord(declaration) ? declaration : {};
  const description = text(decl.description, locale);
  return {
    name,
    label: text(decl.label, locale) ?? titleCase(name),
    ...description ? { description } : {},
    ...availability(decl, locale),
    ...typeof decl.group === "string" ? { group: decl.group } : {},
    ...typeof decl.buttonGroup === "string" ? { buttonGroup: decl.buttonGroup } : {},
    ...typeof decl.icon === "string" ? { icon: decl.icon } : {},
    ...decl.intent === "default" || decl.intent === "danger" ? { intent: decl.intent } : {},
    ...text(decl.confirm, locale) ? { confirm: text(decl.confirm, locale) } : {},
    ...isRecord(decl.input) && decl.input.type === "file" ? { input: {
      type: "file",
      ...typeof decl.input.accept === "string" ? { accept: decl.input.accept } : {},
      ...decl.input.multiple === true ? { multiple: true } : {}
    } } : {}
  };
}
function widgetOptionAttributeValue(type, value, multiple = false) {
  if (type === "boolean") return value === true ? "" : null;
  if (value === null || value === "") return null;
  if (type === "object" || type === "array" || type === "select" && multiple) return JSON.stringify(value);
  return String(value);
}
function localizedText(value, locale) {
  if (typeof value === "string") return value;
  if (!value) return;
  const normalizedLocale = locale.toLowerCase();
  const exactKey = Object.keys(value).find((key) => key.toLowerCase() === normalizedLocale);
  const language = normalizedLocale.split("-")[0];
  const languageKey = Object.keys(value).find((key) => key.toLowerCase() === language);
  return exactKey && value[exactKey] || languageKey && value[languageKey] || value._;
}
function widgetDeclarations(widget, kind) {
  const read = (name) => {
    try {
      const own = widget[name];
      if (isRecord(own)) return own;
      const inherited = widget.constructor[name];
      return isRecord(inherited) ? inherited : {};
    } catch {
      return {};
    }
  };
  return kind === "options" ? { ...read("dynamicOptions"), ...read(kind) } : read(kind);
}
function widgetOptionDeclaration(widget, name, declaration) {
  if (!isRecord(declaration) || typeof declaration.attribute === "string" || declaration.attribute === false) return declaration;
  let properties;
  try {
    properties = widget.constructor.elementProperties;
  } catch {
    return declaration;
  }
  const property = properties instanceof Map ? properties.get(name) : void 0;
  if (!isRecord(property)) return declaration;
  if (typeof property.attribute === "string" || property.attribute === false) return { ...declaration, attribute: property.attribute };
  return property.state === true ? { ...declaration, attribute: false } : declaration;
}
function readWidgetOption(widget, name, raw, locale) {
  const declaration = widgetOptionDeclaration(widget, name, raw);
  let value = null;
  try {
    value = widget[name];
  } catch {
  }
  const option = widgetOptionState(name, declaration, value, locale);
  if (value !== void 0 || option.attribute === null) return option;
  const attribute = widget.getAttribute(option.attribute);
  const parsed = option.type === "boolean" ? attribute !== null : option.type === "number" && attribute !== null ? Number(attribute) : attribute;
  return { ...option, value: widgetOptionValue(parsed) };
}
function validWidgetOptionValue(option, value, widget) {
  if (value === null || value === "") return true;
  if (option.type === "boolean") return typeof value === "boolean";
  if (option.type === "number") return typeof value === "number" && Number.isFinite(value) && (option.control !== "duration" || value >= 0) && (option.min === void 0 || value >= option.min) && (option.max === void 0 || value <= option.max) && (!option.steps?.length || option.steps.includes(value)) && (option.control !== "duration" || !option.step || option.step <= 0 || Math.abs((value - (option.min ?? 0)) / option.step - Math.round((value - (option.min ?? 0)) / option.step)) < 1e-7);
  if (option.type === "reference") return typeof value === "string" && Boolean(option.choices?.some((choice) => choice.value === value));
  if (option.type === "select") {
    let retained = null;
    if (option.control === "tree") {
      try {
        retained = widget[option.name];
      } catch {
        return false;
      }
    }
    const valid = (item) => typeof item === "string" && (option.control === "tree" ? Boolean(option.choices?.some((choice) => choice.value === item)) || Array.isArray(retained) && retained.includes(item) : !option.choices?.length || option.choices.some((choice) => choice.value === item));
    return option.multiple ? Array.isArray(value) && value.every(valid) : valid(value);
  }
  return true;
}
function widgetReferenceOption(widget, option, root, isWidget, identityRoot = root) {
  if (option.type !== "reference") return option;
  const ids = /* @__PURE__ */ new Map();
  identityRoot.querySelectorAll("[id]").forEach((element) => {
    if (element.id) ids.set(element.id, (ids.get(element.id) ?? 0) + 1);
  });
  try {
    const choices = Array.from(root.querySelectorAll(option.selector ?? "*")).flatMap((element) => {
      if (!isWidget(element) || !element.id || ids.get(element.id) !== 1 || option.excludeSelf !== false && element === widget) return [];
      const title = element.getAttribute("aria-label") || element.getAttribute("title") || element.localName;
      return [{ value: element.id, label: `${title} #${element.id}` }];
    });
    return { ...option, choices, ...typeof option.value === "string" && option.value && !choices.some((choice) => choice.value === option.value) ? { referenceMissing: true } : {} };
  } catch {
    return { ...option, choices: [], disabled: true, disabledReason: "Invalid reference selector" };
  }
}
function widgetActionRows(actions) {
  const rows = [];
  for (const action of actions) {
    const row = rows.at(-1);
    if (action.buttonGroup && row?.[0].buttonGroup === action.buttonGroup) row.push(action);
    else rows.push([action]);
  }
  return rows;
}
function widgetConversionMethod(widget, declaration) {
  try {
    const method = typeof declaration === "string" ? widget[declaration] : declaration;
    return typeof method === "function" ? method : void 0;
  } catch {
    return void 0;
  }
}

// widget-option-controls.ts
function widgetOptionInputValue(option, target) {
  if (option.type === "boolean") return target.checked;
  if (option.type === "select" && option.multiple) {
    return Array.from(target.selectedOptions, (choice) => choice.value);
  }
  if (option.type === "number") {
    if (!target.value.trim()) return null;
    if (option.control !== "duration") return Number(target.value);
    const value = parseWidgetDuration(target.value);
    const increments = option.step && option.step > 0 ? (value - (option.min ?? 0)) / option.step : 0;
    if (value === void 0 || option.min !== void 0 && value < option.min || option.max !== void 0 && value > option.max || Math.abs(increments - Math.round(increments)) > 1e-7) {
      target.setCustomValidity("Enter a duration in seconds, m:ss, or h:mm:ss within the allowed range and step");
      target.reportValidity();
      return void 0;
    }
    return value;
  }
  if (option.type === "object" || option.type === "array") {
    if (!target.value.trim()) return null;
    try {
      return widgetOptionValue(JSON.parse(target.value));
    } catch {
      target.setCustomValidity("Enter valid JSON");
      target.reportValidity();
      return void 0;
    }
  }
  return target.value;
}
function renderWidgetOptionField(option, dispatch, fieldScope = "", editor) {
  if (option.hidden) return nothing;
  const locked = Boolean(option.disabled || option.readOnly);
  const commit = (value) => {
    if (!locked) dispatch(option.name, value);
  };
  const change = (event) => {
    if (locked) return;
    const target = event.currentTarget;
    if ("setCustomValidity" in target) target.setCustomValidity("");
    if ("checkValidity" in target && !target.checkValidity()) {
      target.reportValidity();
      return;
    }
    const value = widgetOptionInputValue(option, target);
    if (value !== void 0) commit(value);
  };
  const help = html`${option.description ? html`<span class="develop-field-help">${option.description}</span>` : nothing}
    ${option.disabledReason && locked ? html`<span class="develop-field-help">${option.disabledReason}</span>` : nothing}`;
  const unit = option.unit ? html`<span class="widget-option-unit">${option.unit}</span>` : nothing;
  const label = editor?.label ?? html`<span class="develop-field-label" id=${`widget-${fieldScope}${option.name}`}>${option.label}</span>`;
  if (option.type === "boolean") return html`
    <label class="develop-field widget-option-checkbox" title=${option.disabledReason ?? option.description ?? ""}>
      <input type="checkbox" class=${option.control === "switch" ? "editor-switch" : nothing} role=${option.control === "switch" ? "switch" : nothing}
        .checked=${option.value === true} ?disabled=${locked} @change=${change} />
      <span class="develop-field-label">${option.label}</span>${unit}
    </label>${help}
  `;
  const text2 = option.value === null ? "" : typeof option.value === "object" ? JSON.stringify(option.value, void 0, 2) : String(option.value);
  if (option.type === "select" && option.control === "tree") {
    const selected = new Set(Array.isArray(option.value) ? option.value.filter((value) => typeof value === "string") : []);
    const toggle = (values, checked) => {
      const next = new Set(selected);
      for (const value of values) checked ? next.add(value) : next.delete(value);
      commit([...next]);
    };
    const checkbox = (nodes, label2, group) => {
      const values = widgetTreeLeaves(nodes).map((node) => node.value);
      const count = values.filter((value) => selected.has(value)).length;
      return html`<label><input type="checkbox" data-tree-group=${group ?? nothing} ?data-tree-select-all=${group === void 0}
        .checked=${values.length > 0 && count === values.length} .indeterminate=${count > 0 && count < values.length}
        ?disabled=${locked || !values.length} @click=${(event) => event.stopPropagation()}
        @change=${(event) => toggle(values, event.currentTarget.checked)} />${label2}</label>`;
    };
    const renderNodes = (nodes) => html`<ul>${nodes.map((node) => html`<li>
      ${node.children ? html`<details><summary>${checkbox(node.children, node.label, node.label)}</summary>
        ${renderNodes(node.children)}</details>` : html`<label title=${node.description ?? ""}>
        <input type="checkbox" data-value=${node.value} .checked=${selected.has(node.value)} ?disabled=${locked}
          @change=${(event) => toggle([node.value], event.currentTarget.checked)} />${node.label}</label>`}
    </li>`)}</ul>`;
    return html`<div class="develop-field widget-option-field">${label}
      <div class="widget-option-tree" role="group" aria-label=${option.label}>
        ${checkbox(option.tree ?? [], "Select all")}${renderNodes(option.tree ?? [])}
      </div>${help}</div>`;
  }
  if (option.type === "select" && (option.control === "radio" || option.control === "segmented")) {
    const labelId = `widget-${fieldScope}${option.name}`;
    return html`<div class="develop-field widget-option-field">
      ${label}
      <div class=${option.control === "segmented" ? "choice-group widget-option-segmented" : "widget-option-radios"}
        style=${option.control === "segmented" ? `--choice-columns: ${Math.max(1, Math.min(4, option.choices?.length ?? 1))}` : nothing}
        role="group" aria-labelledby=${labelId}>
        ${(option.choices ?? []).map((choice) => option.control === "radio" ? html`
          <label><input type="radio" name=${labelId} value=${choice.value} .checked=${option.value === choice.value}
            ?disabled=${locked} @change=${() => commit(choice.value)} />${choice.label}</label>` : html`
          <button type="button" aria-pressed=${option.value === choice.value} title=${choice.description ?? choice.label}
            ?disabled=${locked} @click=${() => commit(choice.value)}>${choice.label}</button>`)}
      </div>${unit}${help}
    </div>`;
  }
  let field;
  if (option.type === "number" && option.control === "duration") {
    field = html`<input type="text" data-duration aria-label=${option.label} inputmode="decimal" .value=${typeof option.value === "number" ? formatWidgetDuration(option.value) : ""}
      placeholder=${option.placeholder ?? "m:ss"} min=${option.min ?? 0} max=${option.max ?? nothing} step=${option.step ?? nothing}
      ?disabled=${option.disabled} ?readonly=${option.readOnly} @change=${change} />`;
  } else if (option.type === "reference" || option.type === "select") {
    const choices = option.choices ?? [];
    const missing = Boolean(text2 && !choices.some((choice) => choice.value === text2));
    field = editor ? html`<style-combobox .label=${option.label} .editable=${false} .disabled=${locked}
      .multiple=${Boolean(option.multiple)} .values=${Array.isArray(option.value) ? option.value.map(String) : []}
      .value=${text2} .placeholder=${option.placeholder ?? "Default"}
      .options=${[
      ...!option.multiple ? [{ value: "", label: "Default" }] : [],
      ...!option.multiple && missing ? [{
        value: text2,
        label: option.type === "reference" ? `Missing reference: #${text2}` : text2,
        disabled: option.type === "reference"
      }] : [],
      ...choices
    ]}
      @combobox-change=${(event) => {
      event.stopPropagation();
      if (option.type === "reference" && event.detail.value && !choices.some((choice) => choice.value === event.detail.value)) return;
      const values = event.detail.values ?? [];
      if (option.multiple) commit(choices.length ? values.filter((value) => choices.some((choice) => choice.value === value)) : values);
      else commit(event.detail.value || null);
    }}></style-combobox>` : html`<select aria-label=${option.label} ?multiple=${option.multiple} ?disabled=${locked} @change=${change}>
      ${option.multiple ? nothing : html`<option value="" .selected=${!text2}>${option.placeholder ?? "Default"}</option>`}
      ${!option.multiple && missing ? html`<option .value=${text2} .selected=${true} ?disabled=${option.type === "reference"}>${option.type === "reference" ? `Missing reference: #${text2}` : text2}</option>` : nothing}
      ${choices.map((choice) => html`<option .value=${choice.value}
        .selected=${Array.isArray(option.value) ? option.value.includes(choice.value) : choice.value === text2}>${choice.label}</option>`)}
    </select>`;
  } else if (option.type === "number" && option.control === "range") {
    const steps = [...new Set(option.steps ?? [])].sort((a, b) => a - b).filter((value2) => (option.min === void 0 || value2 >= option.min) && (option.max === void 0 || value2 <= option.max));
    const discrete = steps.length > 0;
    const value = typeof option.value === "number" ? option.value : option.min ?? steps[0] ?? 0;
    field = html`<input type="range" aria-label=${option.label} min=${discrete ? 0 : option.min ?? 0} max=${discrete ? steps.length - 1 : option.max ?? 100}
      step=${discrete ? 1 : option.step ?? 1} .value=${String(discrete ? Math.max(0, steps.indexOf(value)) : value)}
      aria-valuetext=${`${text2}${option.unit ? ` ${option.unit}` : ""}`} ?disabled=${locked}
      @input=${(event) => {
      const input = event.currentTarget;
      commit(discrete ? steps[Number(input.value)] : Number(input.value));
    }} /><output>${text2}</output>`;
  } else if (editor && option.type === "number" && option.control !== "input") {
    const candidates = option.steps?.length ? option.steps : [
      option.min ?? 0,
      (option.min ?? 0) + (option.step ?? 1),
      option.max ?? (option.min ?? 0) + 10 * (option.step ?? 1)
    ];
    const presets = [...new Set(candidates)].filter((value) => (option.min === void 0 || value >= option.min) && (option.max === void 0 || value <= option.max));
    field = html`<style-combobox .showValue=${true} .label=${`${option.label}${option.unit ? ` (${option.unit})` : ""}`} .value=${text2}
      .unit=${option.unit ?? ""} .disabled=${locked} .placeholder=${option.placeholder ?? "Default"}
      .options=${presets.map((value, index) => ({ value: String(value), label: option.steps?.length ? "Value" : ["Low", "Medium", "High"][index] }))}
      @combobox-change=${(event) => {
      event.stopPropagation();
      const draft = event.detail.value.trim();
      const value = Number(draft);
      const input = document.createElement("input");
      input.type = "number";
      input.required = true;
      if (option.min !== void 0) input.min = String(option.min);
      if (option.max !== void 0) input.max = String(option.max);
      input.step = option.step === void 0 ? "any" : String(option.step);
      input.value = draft;
      if (!draft || Number.isFinite(value) && input.checkValidity() && (!option.steps?.length || option.steps.includes(value))) {
        commit(draft ? value : null);
      } else {
        const combo = event.currentTarget;
        combo.value = text2;
        combo.close(true);
      }
    }}></style-combobox>`;
  } else if (option.type === "color") {
    field = editor ? html`<ribbon-combobox variant="color" .name=${`widget-${fieldScope}${option.name}`} .label=${option.label}
      .value=${editor.safeColor(text2)} .swatches=${option.swatches ?? []} .disabled=${locked}
      @ribbon-combobox-change=${(event) => {
      event.stopPropagation();
      commit(event.detail.value || null);
    }}></ribbon-combobox>` : html`<input type="color" aria-label=${option.label} .value=${text2}
      ?disabled=${locked} @change=${change} />
      ${option.swatches?.length ? html`<select aria-label=${`${option.label} presets`} ?disabled=${locked} @change=${change}>
        <option value="" .selected=${!option.swatches.includes(text2)}>Custom</option>
        ${option.swatches.map((color) => html`<option .value=${color} .selected=${color === text2}>${color}</option>`)}
      </select>` : nothing}`;
  } else if (option.type === "object" || option.type === "array") {
    field = html`<textarea data-json aria-label=${option.label} spellcheck="false" .value=${text2} placeholder=${option.placeholder ?? ""}
      ?disabled=${option.disabled} ?readonly=${option.readOnly} @change=${change}></textarea>`;
  } else if (option.type === "string" && option.multiline) {
    field = html`<textarea aria-label=${option.label} .value=${text2} placeholder=${option.placeholder ?? ""}
      ?disabled=${option.disabled} ?readonly=${option.readOnly}
      minlength=${option.minlength ?? nothing} maxlength=${option.maxlength ?? nothing} @change=${change}></textarea>`;
  } else {
    field = html`<input type=${option.type === "string" ? "text" : option.type} aria-label=${option.label} .value=${text2} placeholder=${option.placeholder ?? ""}
      ?disabled=${option.disabled} ?readonly=${option.readOnly}
      min=${option.min ?? nothing} max=${option.max ?? nothing} step=${option.step ?? (!editor && option.type === "number" ? "any" : nothing)}
      pattern=${option.pattern ?? nothing} minlength=${option.minlength ?? nothing} maxlength=${option.maxlength ?? nothing}
      @change=${change} />`;
  }
  return html`<div class="develop-field widget-option-field">${label}
    <span class="widget-option-value">${field}${editor && option.type === "number" && !option.control ? nothing : unit}</span>${help}</div>`;
}
function renderWidgetOptions(options, actions, groups, renderField, renderActions) {
  const visibleOptions = options.filter((option) => !option.hidden);
  const visibleActions = actions.filter((action) => !action.hidden);
  if (!visibleOptions.length && !visibleActions.length) return nothing;
  const fields = (group) => html`
    ${visibleOptions.filter((option) => (option.group || void 0) === group).map(renderField)}
    ${renderActions(visibleActions.filter((action) => (action.group || void 0) === group))}`;
  const usedGroups = [...groups];
  for (const item of [...visibleOptions, ...visibleActions]) {
    if (item.group && !usedGroups.some((group) => group.name === item.group)) usedGroups.push({ name: item.group, label: item.group });
  }
  return html`<div class="widget-options">${fields()}
    ${repeat(usedGroups.filter((group) => [...visibleOptions, ...visibleActions].some((item) => item.group === group.name)), (group) => group.name, (group) => html`
      <section class="widget-option-group" data-group=${group.name}>
        ${group.collapsible || group.advanced ? html`<details .open=${!group.collapsed && !group.advanced}>
          <summary>${group.label}</summary>
          ${group.description ? html`<p class="develop-field-help">${group.description}</p>` : nothing}
          <div class="widget-option-group-fields">${fields(group.name)}</div>
        </details>` : html`<strong>${group.label}</strong>
          ${group.description ? html`<p class="develop-field-help">${group.description}</p>` : nothing}
          <div class="widget-option-group-fields">${fields(group.name)}</div>`}
      </section>`)}
  </div>`;
}

// widget-option-controls.styles.ts
import { css } from "lit";
var widgetOptionControlStyles = css`
  .widget-options {
    display: grid;
    gap: 0.45rem;
    min-width: 12rem;
  }

  .widget-options .widget-option-field :is(input:not([type="checkbox"], [type="radio"], [type="range"]), textarea) {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: .2rem;
    border: var(--editor-control-border-width, .5px) solid #c5ccd5;
    border-radius: 4px;
    color: #2f3742;
    background: transparent;
    font: inherit;
    font-size: .68rem;
  }
  .widget-options .widget-option-field input:not([type="checkbox"], [type="radio"], [type="range"]) {
    height: 1.7rem;
    min-height: 1.7rem;
  }
  .widget-options .widget-option-field :is(input, textarea):focus-visible {
    border-color: #c5ccd5;
    outline: 2px solid #b9d7f5;
    outline-offset: 0;
  }
  .widget-options .widget-option-field :is(input, textarea):invalid {border-color: #c2413a;}
  .widget-options :is(input, textarea):disabled {opacity: .55; cursor: default;}
  .widget-options input:is([type="checkbox"], [type="radio"]) {accent-color: #3977c7;}
  .widget-options input.editor-switch {--switch-width: 1.9rem; --switch-height: 1.05rem;}

  .develop-field.widget-option-checkbox {
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
  }

  .widget-option-group, .widget-option-group-fields {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .widget-option-group {
    border-top: 1px solid #dce3ec;
    padding-top: 0.45rem;
    font-size: 0.7rem;
    color: #526b86;
  }

  .widget-option-group > details > summary { cursor: pointer; font-weight: 600; }
  .widget-option-group > details[open] > summary { margin-bottom: 0.45rem; }
  .widget-option-group p { margin: 0; }
  .widget-option-value { display: flex; align-items: center; gap: 0.35rem; min-width: 0; }
  .widget-option-value > style-combobox {flex: 1; min-width: 0;}
  .widget-option-value > ribbon-combobox {flex: 0 0 auto;}
  .widget-option-value:has(> .widget-option-unit):not(:has(input[type="range"])) {gap: 0;}
  .widget-option-value:has(> .widget-option-unit) > input {border-top-right-radius: 0; border-bottom-right-radius: 0;}
  .widget-option-value > .widget-option-unit {display: flex; align-items: center; align-self: stretch; padding: 0 .3rem; border: var(--editor-control-border-width, .5px) solid #c5ccd5; border-left: 0; border-radius: 0 4px 4px 0; font-size: .55rem;}
  .widget-option-value:has(input[type="range"]) > .widget-option-unit {border: 0; padding: 0;}
  .widget-option-value input[type="range"] {width: 100%; min-width: 0; height: 1.2rem; min-height: 0; padding: 0; border: 0; box-shadow: none; background: transparent; accent-color: #3977c7;}
  .widget-option-value > input, .widget-option-value > select, .widget-option-value > textarea { flex: 1; min-width: 0; }
  .widget-option-value output, .widget-option-unit { flex: 0 0 auto; }
  .widget-option-field > .develop-field-help { grid-column: 1 / -1; }
  .widget-option-tree { min-width: 0; overflow-wrap: anywhere; }
  .widget-option-tree ul { list-style: none; padding: 0; padding-inline-start: 0.8rem; margin: 0.25rem 0 0; }
  .widget-option-tree li { margin: 0.25rem 0; }
  .widget-option-tree label { display: inline-flex; align-items: flex-start; gap: 0.3rem; max-width: 100%; }
  .widget-option-tree input { flex: 0 0 auto; margin: .05rem 0 0; }
  .widget-option-tree :is(summary, li > label) { box-sizing: border-box; padding-inline-start: 0.8rem; }
  .widget-option-tree summary {cursor: pointer; list-style-position: outside;}
  .widget-option-tree summary > label {vertical-align: top;}
  .widget-option-unit { color: #526b86; font-size: 0.65rem; }
  .widget-option-radios { display: grid; gap: 0.3rem; }
  .widget-option-radios label { display: flex; align-items: center; gap: 0.3rem; }
  .widget-option-segmented button {min-height: 1.7rem; padding: .15rem .2rem; font: .68rem/1.2 system-ui, sans-serif; overflow-wrap: anywhere;}
  .widget-option-segmented button:disabled {opacity: .55; cursor: default;}
  .widget-action-item { display: grid; gap: 0.2rem; min-width: 0; }
  .widget-action-error { color: #b0342c; font-size: 0.65rem; overflow-wrap: anywhere; }
  .widget-action[data-intent="danger"] {--ribbon-control-color: #a72c25;}
  .widget-actions {display: grid; gap: .3rem; min-width: 0;}
  .choice-group.widget-action-group {
    display: flex;
    flex-wrap: wrap;
    background: #c5ccd5;
    --widget-action-border-width: 0;
    --widget-action-border-radius: 0;
  }
  .widget-action-group > .widget-action-item {flex: 1 1 5rem; background: #f7f7f7;}
  .widget-action-group > .widget-action-item > :is(.develop-field-help, .widget-action-error) {padding: 0 .3rem .2rem;}

`;

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
      const text2 = stored?.text ?? this.defaults;
      this.saved = this.type === "application/json" ? text2.replace(/</g, "\\u003c") : text2;
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
    const text2 = this.block.textContent ?? "";
    if (text2 === this.observed) return;
    this.observed = text2;
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
  static styles = [widgetOptionControlStyles, css2`
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
  message(error) {
    return error instanceof Error ? error.message : String(error);
  }
  confirm(text2) {
    return this.ownerDocument.defaultView?.confirm?.(text2) === true;
  }
  locale(widget) {
    return widget.closest("[lang]")?.getAttribute("lang") ?? widget.ownerDocument.documentElement.lang ?? "en";
  }
  option(widget, name, declaration) {
    const option = readWidgetOption(widget, name, declaration, this.locale(widget));
    return widgetReferenceOption(
      widget,
      option,
      widget.getRootNode(),
      (element) => element.namespaceURI === "http://www.w3.org/1999/xhtml" && element.localName.includes("-") && element.matches(":defined")
    );
  }
  setOption = (name, value) => {
    const widget = this.target;
    if (!this.active(widget)) return;
    const declarations = widgetDeclarations(widget, "options");
    if (!Object.hasOwn(declarations, name)) return;
    const option = this.option(widget, name, declarations[name]);
    if (option.hidden || option.disabled || option.readOnly || !validWidgetOptionValue(option, value, widget)) {
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
        const text2 = widgetOptionAttributeValue(option.type, value, option.multiple);
        if (text2 === null) widget.removeAttribute(option.attribute);
        else {
          const url = text2.toLowerCase().replace(/[\u0000-\u0020]/g, "");
          if (["href", "src", "xlink:href", "action", "formaction", "poster", "cite", "data"].includes(attribute) && /^(?:javascript:|vbscript:|data:(?:text\/html|image\/svg\+xml))/.test(url)) throw new TypeError("The option contains an unsafe URL.");
          widget.setAttribute(option.attribute, text2);
        }
      }
      this.actionError = void 0;
    } catch (error) {
      this.actionError = { name: "", message: this.message(error) };
    }
    this.requestUpdate();
  };
  action(widget, name) {
    const declarations = widgetDeclarations(widget, "actions");
    const method = Object.hasOwn(declarations, name) ? widgetConversionMethod(widget, name) : void 0;
    return method ? { method, state: widgetActionState(name, declarations[name], this.locale(widget)) } : void 0;
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
    return Object.entries(widgetDeclarations(widget, direction)).filter(([format, declaration]) => isWidgetFileFormat(format) && widgetConversionMethod(widget, declaration)).map(([format]) => format);
  }
  convert(widget, direction, format) {
    if (!this.active(widget) || this.running || this.fileSelection) return;
    const lookup = () => {
      const declarations = widgetDeclarations(widget, direction);
      return Object.hasOwn(declarations, format) ? widgetConversionMethod(widget, declarations[format]) : void 0;
    };
    const method = lookup();
    if (!method) return;
    const execute = async (files) => this.run(`${direction}:${format}`, async () => {
      if (!this.active(widget) || lookup() !== method) return;
      const file = files?.[0];
      if (direction === "convertFrom" && (!file || !matchesWidgetFileFormat(file, format))) {
        throw new TypeError(`Choose a ${format} file to import.`);
      }
      const snapshot = file ? widget.outerHTML : null;
      const result = await (file ? method.call(widget, file) : method.call(widget));
      if (!this.active(widget) || lookup() !== method || result === null || result === false) return;
      if (snapshot !== null && snapshot !== widget.outerHTML) throw new Error("The widget changed before the file could be imported.");
      if (file) {
        if (typeof result !== "function") throw new TypeError("A file importer must return a function that applies the imported content.");
        result.call(widget);
      } else {
        const view = widget.ownerDocument.defaultView;
        if (!(result instanceof view.File) || !result.name || !matchesWidgetFileFormat(result, format)) {
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
    const button = (action) => html2`<div class="widget-action-item">
      <button type="button" class="widget-action" data-intent=${action.intent ?? nothing2}
        ?disabled=${action.disabled || this.running || this.fileSelection} @click=${() => this.invoke(action.name)}>${action.label}</button>
      ${action.description ? html2`<span class="develop-field-help">${action.description}</span>` : nothing2}
      ${action.disabled && action.disabledReason ? html2`<span class="develop-field-help">${action.disabledReason}</span>` : nothing2}
      ${this.actionError?.name === action.name ? html2`<span class="widget-action-error" role="alert">${this.actionError.message}</span>` : nothing2}
    </div>`;
    return html2`<div class="widget-actions">${widgetActionRows(actions).map((row) => row.length === 1 ? button(row[0]) : html2`<div class="choice-group widget-action-group" role="group">${row.map(button)}</div>`)}</div>`;
  }
  renderConversions(widget) {
    const imports = this.formats(widget, "convertFrom");
    const exports = this.formats(widget, "convertTo");
    if (!imports.length && !exports.length) return nothing2;
    const buttons = (formats, direction, label) => formats.map((format) => html2`
      <button type="button" ?disabled=${this.running || this.fileSelection}
        @click=${() => this.convert(widget, direction, format)}>${label} ${format}</button>
    `);
    return html2`<div class="conversion-group" role="group" aria-label="Import and export">
      ${buttons(imports, "convertFrom", "Import")}${buttons(exports, "convertTo", "Export")}
    </div>`;
  }
  renderStorage() {
    const saving = this.status?.state === "saving";
    return html2`<form class="storage-controls" @submit=${this.applyStorage}>
      <label for="storage-kind">Autosave to</label>
      <select id="storage-kind" .value=${live(this.draftKind)} ?disabled=${saving} @change=${this.chooseStorage}>
        <option value="browser">This browser</option><option value="http">Remote endpoint</option>
      </select>
      ${this.draftKind === "http" ? html2`<div class="storage-endpoint">
        <input id="storage-url" type="text" inputmode="url" spellcheck="false" required
          aria-label="Endpoint URL" placeholder="Endpoint URL" .value=${live(this.draftUrl)} @input=${(event) => {
      const input = event.currentTarget;
      input.setCustomValidity("");
      this.draftUrl = input.value;
    }}>
        <button type="submit" ?disabled=${saving}>Apply</button>
      </div>` : nothing2}
    </form>`;
  }
  render() {
    const widget = this.target;
    if (!this.active(widget)) return nothing2;
    const options = Object.entries(widgetDeclarations(widget, "options")).map(([name, declaration]) => this.option(widget, name, declaration));
    const actions = Object.keys(widgetDeclarations(widget, "actions")).flatMap((name) => {
      const action = this.action(widget, name);
      return action ? [action.state] : [];
    });
    const groups = Object.entries(widgetDeclarations(widget, "optionGroups")).map(([name, declaration]) => widgetOptionGroupState(name, declaration, this.locale(widget)));
    const controls = renderWidgetOptions(
      options,
      actions,
      groups,
      (option) => renderWidgetOptionField(option, this.setOption),
      (actions2) => this.renderActions(actions2)
    );
    const conversions = this.renderConversions(widget);
    if (controls === nothing2 && conversions === nothing2 && !this.defaults) return nothing2;
    return html2`<details class="drawer" part="drawer">
      <summary part="summary">Widget settings</summary>
      <div class="contents">
        ${controls}${conversions}
        ${this.running ? html2`<span role="status">Working…</span>` : nothing2}
        ${this.actionError && !actions.some((action) => action.name === this.actionError?.name) ? html2`<p class="error" role="alert">${this.actionError.message}</p>` : nothing2}
        ${this.defaults ? this.renderStorage() : nothing2}
      </div>
    </details>
    <input type="file" hidden @change=${this.filePicked} @cancel=${this.filePicked}>`;
  }
};

// index.ts
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
var LitElementWw = class extends SignalWatcher(LitElement2) {
  static scopedElements = {};
  static options = {};
  static actions = {};
  static optionGroups = {};
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
  /** Empty opts into local storage. A URL supplies the initial remote destination. */
  get standalone() {
    return this.getAttribute("standalone");
  }
  set standalone(value) {
    if (value === null) this.removeAttribute("standalone");
    else this.setAttribute("standalone", value);
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
    return [.../* @__PURE__ */ new Set([...super.observedAttributes, "contenteditable", "lang", "shared", "id", "standalone"])];
  }
  attributeChangedCallback(name, oldValue, value) {
    super.attributeChangedCallback(name, oldValue, value);
    if (oldValue === value) return;
    if (name === "standalone") this.requestUpdate("standalone", oldValue);
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
    if (event.type === "datarelease") {
      this.#block = void 0;
      this.#syncData();
      return;
    }
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
    const text2 = type === "application/json" ? value.replace(/</g, "\\u003c") : value;
    if (/<\/script[\s/>]/i.test(text2)) throw new TypeError("Data blocks cannot contain a closing script tag");
    const block = old ?? this.ownerDocument.createElement("script");
    for (const [name, value2] of Object.entries(attrs)) block.setAttribute(name, value2);
    block.type = type;
    block.textContent = text2;
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
    for (const type of ["datapending", "datachange", "dataerror", "datarelease"]) this.addEventListener(type, this.#dataEvent);
    this.#contentObserver.observe(this, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["type", "src", "slot"] });
    this.renderRoot.addEventListener("slotchange", this.#slotChanged);
    this.#block = void 0;
    this.#syncData();
  }
  disconnectedCallback() {
    this.#contentObserver.disconnect();
    for (const type of ["datapending", "datachange", "dataerror", "datarelease"]) this.removeEventListener(type, this.#dataEvent);
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
  BrowserWidgetResultStorage,
  HttpWidgetResultStorage,
  LitElementWw,
  WidgetDrawer,
  WidgetResultConflict,
  compatibleControl,
  formatWidgetDuration,
  isDataBlockType,
  isRecord,
  isWidgetFileFormat,
  localizedText,
  matchesWidgetFileFormat,
  parseWidgetDuration,
  readWidgetOption,
  renderWidgetOptionField,
  renderWidgetOptions,
  validWidgetOptionValue,
  widgetActionRows,
  widgetActionState,
  widgetConversionMethod,
  widgetDeclarations,
  widgetOptionAttribute,
  widgetOptionAttributeValue,
  widgetOptionControlStyles,
  widgetOptionControls,
  widgetOptionDeclaration,
  widgetOptionGroupState,
  widgetOptionState,
  widgetOptionType,
  widgetOptionTypes,
  widgetOptionValue,
  widgetReferenceOption,
  widgetResultEndpoint,
  widgetTreeLeaves
};
