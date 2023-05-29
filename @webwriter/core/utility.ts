/**
 * Escapes HTML reserved characters (&, <, >, ", ') with HTML entities.
 * @param unsafe Unsafe (unescaped) string
 */
export const escapeHTML = (unsafe: string) => unsafe
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;")

/**
 * Returns the file extension if present in path.
 * @param path Path string that has a file extension
 */
export function getFileExtension(path: string) {
  return path.slice((path.lastIndexOf(".") - 1 >>> 0) + 2)
}

/**
 * Returns the file name with if present in URL.
 * @param url URL string
 */
export function getFileNameInURL(url: string) {
  return new URL(url).pathname.split("/").at(-1)
}

/**
 * Returns the word with the first letter capitalized.
 * @param s A single word as a string
 */
export function capitalizeWord(s: string) {
  return s? s[0].toUpperCase() + s.slice(1): s
}

/**
 * Converts a camel cased string ("myFoo") into a spaced string ("My Foo").
 * @param str A camel cased string
 * @param capitalizeFirstLetter If true, capitalizes the first letter
 * @param separator If true, capitalizes the first letter
 */
export function camelCaseToSpacedCase(str: string, capitalize=true, separator=" ") {
  const spacedStr = str.replace(/([A-Z][a-z]|[0-9])+/g, separator + "$&")
  return capitalize? spacedStr.replace(/^[a-z]/g, match => match.toUpperCase()): spacedStr.toLowerCase()
}

/**
 * Returns the unscoped name of the given npm package name. ("@foo/bar" -> "bar")
 * @param name Scoped package name.
 */
export function unscopePackageName(name: string) {
  return name.split(/\@.*\//).pop() ?? name
}

/**
 * Returns a WebWriter npm package name without the scope, if present, without the segment before the first dash, and capitalized. ("@webwriter/ww-figure" -> "Figure")
 * @param name WebWriter npm package name
 * @param capitalize Either "all", "first" or undefined, capitalizing either all words, only the first, or none. 
 */
export function prettifyPackageName(name: string, capitalize: "all" | "first" = "all") {
  let nameParts = unscopePackageName(name)?.split("-").slice(1) ?? []
  if(capitalize === "all") {
    return nameParts.map(capitalizeWord).join(" ")
  }
  else if(capitalize === "first") {
    return [capitalizeWord(nameParts[0]), ...nameParts.slice(1)].join(" ")
  }
  else {
    return nameParts.join(" ")
  }
}

/**
 * Generates a hash code from a string based on each character.
 */
export function hashCode(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
      let chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Checks if the given element's content is overflown horizontally.
 */
export function isOverflownX(el: Element) {
  return el.scrollWidth > el.clientWidth
}

/**
 * Checks if the given element's content is overflown vertically.
 */
export function isOverflownY(el: Element) {
  return el.scrollHeight > el.clientHeight
}

/**
 * Checks if the given element's content is overflown either horizontally or vertically.
 */
export function isOverflown(el: Element) {
  return isOverflownX(el) || isOverflownY(el)
}


/**
 * Returns the array with the element at the given position replaced.
 * @param arr Base array
 * @param i Position to replace at
 * @param item Item to place at the position
 */
export function arrayReplaceAt<T extends Array<any>>(arr: T, i: number, item: any) {
  return [...arr.slice(0, i), item, ...arr.slice(i + 1)]
}

/**
 * Create an element in the given document, immediately assigning properties and attributes.
 * @param doc Document to create the element in.
 * @param tagName Name of the element to create, must be available in the document.
 * @param options Options to pass to `createElement`
 * @param attributes Attributes to assign
 * @param properties Properties to assign
 * @returns The created element
 */
export function createElementWithAttributes(doc: Document, tagName: string, options?: ElementCreationOptions, attributes: Record<string, string> = {}, properties: Record<string, any> = {}) {
  const el = doc.createElement(tagName, options)
  Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value))
  Object.entries(properties).forEach(([key, value]) => (el as any)[key] = value)
  return el
}

/**
 * Converts a NamedNodeMap into an object.
 */
export function namedNodeMapToObject(nodeMap: NamedNodeMap) {
  return Object.fromEntries(Array.from(nodeMap).map(x => [x.name, x.value]))
}

/**
 * Calculates this browser's scrollbar width and caches the result.
 */
export function getScrollbarWidth(): number {
  var div, width = (getScrollbarWidth as any)["width"];
  if (width === undefined) {
    div = document.createElement('div');
    div.innerHTML = '<div style="width:50px;height:50px;position:absolute;left:-50px;top:-50px;overflow:auto;"><div style="width:1px;height:100px;"></div></div>';
    div = div.firstChild as HTMLElement;
    document.body.appendChild(div);
    width = (getScrollbarWidth as any)["width"] = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);
  }
  return width;
};

/**
 * Prettify a bytes number into human readable form.
 */
export function shortenBytes(n: number) {
  const k = n > 0 ? Math.floor((Math.log2(n)/10)) : 0
  const rank = (k > 0 ? 'KMGT'[k - 1] : '') + 'b'
  const count = Math.floor(n / Math.pow(1024, k))
  return count + rank
}

/**
 * For two iterables, check if they have the same members (structural equality). If any of the parameters is not iterable, do a strict equality comparison.
 */
export function sameMembers(a: Iterable<any> | any, b: Iterable<any> | any) {
  if(!(Symbol.iterator in Object(a)) || !(Symbol.iterator in Object(b))) {
    return a === b
  }
  const _a = [...a]
  const _b = [...b]
  const sameLength = _a.length === _b.length
  return sameLength && _a.every(x => _b.includes(x)) && _b.every(y => _a.includes(y))
}

/**
 * For two objects, check if all key-value pairs are equal (shallow comparison).
 */
export function shallowCompare(obj1: any, obj2: any) {
  return Object.keys(obj1).length === Object.keys(obj2).length 
    && Object.keys(obj1).every(key => obj2.hasOwnProperty(key) 
    && obj1[key] === obj2[key])
}

/** Round a given value to the device pixel ratio. */
export function roundByDPR(value: number) {
  const dpr = window.devicePixelRatio || 1
  return Math.round(value * dpr) / dpr
}

/** Filter an object based on a function. */
export function filterObject<T extends {}>(value: T, func: (key: string, value: T) => boolean) {
  return Object.fromEntries((Object.entries(value) as [string, T][]).filter(([k, v]) => func(k, v)))
}

/** Create a new object by picking entries of the old object by key. */
export function pickObject<T extends {}, K extends keyof T>(value: T, keys: K[]) {
  return Object.fromEntries(keys.map(k => [k, value[k]])) as Pick<T, K>
}

export {default as groupBy} from "lodash.groupby"