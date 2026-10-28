export const distributionTarget = "ww-distribute"

export const distributionPermissions = Object.freeze([
  "edit",
  "move",
  "delete",
  "duplicate",
  "style",
  "insert",
])

const scopes = new Set(["individual", "group", "all"])
const permissionSet = new Set(distributionPermissions)
const configKeys = new Set(["version", "target", "scope", "groupSize", "permissions", "add", "items"])
const itemKeys = new Set(["id", "label", "html"])
const MAX_STRING = 256
const MAX_ITEM_HTML = 1_000_000
const MAX_TOTAL_HTML = 4_000_000
const MAX_ITEMS = 256

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyKeys(value, allowed) {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.has(key))
}

function requireString(value, name, { max = MAX_STRING, empty = false } = {}) {
  if (typeof value !== "string" || value.length > max || (!empty && value.length === 0)) {
    throw new TypeError(`Invalid distribution ${name}`)
  }
  return value
}

function validateAddEntry(value) {
  const entry = requireString(value, "add entry")
  if (entry === "element:*") return entry
  const separator = entry.indexOf(":")
  if (separator < 1 || separator === entry.length - 1) {
    throw new TypeError("Invalid distribution add entry")
  }
  const prefix = entry.slice(0, separator)
  const member = entry.slice(separator + 1)
  if (member.includes("*") || !["element", "insert-graphic-shape", "insert-math", "list-style", "package-member", "user-snippet", "package"].includes(prefix)) {
    throw new TypeError("Invalid distribution add entry")
  }
  return entry
}

export function isDistributionPermission(value) {
  return typeof value === "string" && permissionSet.has(value)
}

export function validateDistributionConfig(value) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, configKeys)) throw new TypeError("Invalid distribution config")
  if (Object.hasOwn(value, "__proto__") || Object.hasOwn(value, "constructor") || Object.hasOwn(value, "prototype")) {
    throw new TypeError("Invalid distribution config")
  }
  if (value.version !== 1) throw new TypeError("Invalid distribution version")
  const target = requireString(value.target, "target")
  if (!scopes.has(value.scope)) throw new TypeError("Invalid distribution scope")
  if (Object.hasOwn(value, "groupSize") && (!Number.isSafeInteger(value.groupSize) || value.groupSize < 2 || value.groupSize > 999)) {
    throw new TypeError("Invalid distribution group size")
  }
  if (!Array.isArray(value.permissions) || !Array.isArray(value.add) || !Array.isArray(value.items)) {
    throw new TypeError("Invalid distribution arrays")
  }
  const permissions = value.permissions.map((permission) => {
    if (!isDistributionPermission(permission)) throw new TypeError("Invalid distribution permission")
    return permission
  })
  if (new Set(permissions).size !== permissions.length) throw new TypeError("Duplicate distribution permission")
  const add = value.add.map(validateAddEntry)
  if (new Set(add).size !== add.length) throw new TypeError("Duplicate distribution add entry")
  if (value.items.length > MAX_ITEMS) throw new TypeError("Too many distribution items")
  let totalHtmlLength = 0
  const itemIds = new Set()
  const items = value.items.map((item) => {
    if (!isPlainObject(item) || !hasOnlyKeys(item, itemKeys) || Object.hasOwn(item, "__proto__") || Object.hasOwn(item, "constructor") || Object.hasOwn(item, "prototype")) {
      throw new TypeError("Invalid distribution item")
    }
    const id = requireString(item.id, "item id")
    const label = requireString(item.label, "item label")
    const html = requireString(item.html, "item html", { max: MAX_ITEM_HTML })
    if (itemIds.has(id)) throw new TypeError("Duplicate distribution item id")
    itemIds.add(id)
    if (!add.includes(id) && !(add.includes("element:*") && id.startsWith("element:"))) {
      throw new TypeError("Distribution item is not allowed by add")
    }
    totalHtmlLength += html.length
    if (totalHtmlLength > MAX_TOTAL_HTML) throw new TypeError("Distribution HTML is too large")
    return { id, label, html }
  })
  return { version: 1, target, scope: value.scope,
    ...(value.scope === "group" && value.groupSize !== undefined ? {groupSize: value.groupSize} : {}), permissions, add, items }
}

export function encodeDistributionConfig(config) {
  return encodeURIComponent(JSON.stringify(validateDistributionConfig(config)))
}

export function decodeDistributionConfig(data) {
  if (typeof data !== "string") return null
  try {
    return validateDistributionConfig(JSON.parse(decodeURIComponent(data)))
  } catch {
    return null
  }
}

export function emptyDistributionConfig(target) {
  return validateDistributionConfig({ version: 1, target, scope: "individual", permissions: [], add: [], items: [] })
}
