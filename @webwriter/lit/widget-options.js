import { resolveDeclarations } from "@webwriter/widget";
const widgetOptionTypes = [
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
const widgetOptionControls = ["input", "range", "duration", "checkbox", "switch", "select", "radio", "segmented", "tree"];
const fileExtension = /^\.[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/i;
const mediaType = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;
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
const isRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const optionalNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : void 0;
const optionalString = (value) => typeof value === "string" ? value : void 0;
const text = (value, locale) => {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return void 0;
  const entries = Object.entries(value).filter((entry) => typeof entry[1] === "string");
  return localizedText(Object.fromEntries(entries), locale);
};
const titleCase = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replaceAll(/[-_]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
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
const availability = (decl, locale) => ({
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
const compatibleControl = (type, control, multiple) => type === "boolean" ? control === "checkbox" || control === "switch" : type === "number" ? control === "input" || control === "range" || control === "duration" : type === "select" ? control === "select" || multiple === true && control === "tree" || !multiple && (control === "radio" || control === "segmented") : false;
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
    ...type === "boolean" && decl.attribute !== false && decl.inverted === true ? { inverted: true } : {},
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
function widgetOptionAttributeValue(type, value, multiple = false, inverted = false) {
  if (type === "boolean") return value === !inverted ? "" : null;
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
      const map = isRecord(own) ? own : widget.constructor[name];
      if (!isRecord(map)) return {};
      return name === "convertFrom" || name === "convertTo" ? map : resolveDeclarations(widget, map) ?? {};
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
  if (option.inverted && option.attribute !== null) return { ...option, value: !widget.hasAttribute(option.attribute) };
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
export {
  compatibleControl,
  formatWidgetDuration,
  isRecord,
  isWidgetFileFormat,
  localizedText,
  matchesWidgetFileFormat,
  parseWidgetDuration,
  readWidgetOption,
  validWidgetOptionValue,
  widgetActionRows,
  widgetActionState,
  widgetConversionMethod,
  widgetDeclarations,
  widgetOptionAttribute,
  widgetOptionAttributeValue,
  widgetOptionControls,
  widgetOptionDeclaration,
  widgetOptionGroupState,
  widgetOptionState,
  widgetOptionType,
  widgetOptionTypes,
  widgetOptionValue,
  widgetReferenceOption,
  widgetTreeLeaves
};
