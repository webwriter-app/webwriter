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
 */
export function camelCaseToSpacedCase(str: string, capitalizeFirstLetter=true) {
  const spacedStr = str.replace(/([A-Z][a-z]|[0-9])+/g, " $&")
  return capitalizeFirstLetter? spacedStr.replace(/^[a-z]/g, match => match.toUpperCase()): spacedStr
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
 * Detects the environment WebWriter is running in.
 * @returns Either "tauri" for a Tauri WebView, "node" for a NodeJS runtime, or "unknown" for anything else.
 */
export function detectEnvironment() {
  try {
  	if(window && (window as any)?.__TAURI__ ) {
      return "tauri"
    }
    else if(window && (globalThis === window)) {
      return "node"
    }
    else {
      return "unknown"
    } 
  }
  catch(error) {
    return "unknown"
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