import { chainCommands } from "prosemirror-commands"
import { Command, EditorState } from "prosemirror-state"
import type { ZodSchema } from "zod"
export {set} from "lodash"

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
 * Converts a kebab cased string ("my-foo") to a camel cased string ("myFoo").
 * @param str A kebap cased string
 */
export function kebapCaseToCamelCase(str: string) {
  const parts = str.split("-")
  return parts[0] + parts.slice(1).map(p => capitalizeWord(p)).join("")
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
 * @param dropLeading If true, ignore the first part of the name, e.g. "webwriter-textarea" -> "Textarea". 
 */
export function prettifyPackageName(name: string, capitalize: "all" | "first" = "all", dropLeading=false) {
  let nameParts = unscopePackageName(name)?.split("-").slice(dropLeading? 1: 0) ?? []
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
    && Object.keys(obj1).every(key => Object.hasOwn(obj2, key) 
    && obj1[key] === obj2[key])
}

/** Round a given value to the device pixel ratio. */
export function roundByDPR(value: number) {
  const dpr = window.devicePixelRatio || 1
  return Math.round(value * dpr) / dpr
}

/** Filter an object based on a function. */
export function filterObject<T extends {}>(value: T, func: (key: string, value: T[keyof T]) => boolean) {
  return Object.fromEntries((Object.entries(value) as [string, T[keyof T]][]).filter(([k, v]) => func(k, v)))
}

/** Create a new object by picking entries of the old object by key. */
export function pickObject<T extends {}, K extends keyof T>(value: T, keys: K[]) {
  return Object.fromEntries(keys.map(k => [k, value[k]])) as Pick<T, K>
}

/** Return a range of numbers up to `a` or starting at `a` and up to, but excluding `b`.
 */
export function range(a: number, b?: number) {
  return [...Array((b ?? a*2) - a).keys()].map(x => x + (b? a: 0))
}

export {groupBy} from "lodash"


let ELEMENT_RE = /[\w-]+/g,
    ID_RE = /#[\w-]+/g,
    CLASS_RE = /\.[\w-]+/g,
    ATTR_RE = /\[[^\]]+\]/g,
    // :not() pseudo-class does not add to specificity, but its content does as if it was outside it
    PSEUDO_CLASSES_RE = /\:(?!not)[\w-]+(\(.*\))?/g,
    PSEUDO_ELEMENTS_RE = /\:\:?(after|before|first-letter|first-line|selection)/g;
// convert an array-like object to array
function toArray(list: any): any[] {
    return [].slice.call(list);
}

// handles extraction of `cssRules` as an `Array` from a stylesheet or something that behaves the same
function getSheetRules(stylesheet: CSSStyleSheet) {
    let sheet_media = stylesheet.media && stylesheet.media.mediaText;
    // if this sheet is disabled skip it
    if ( stylesheet.disabled ) return [];
    // if this sheet's media is specified and doesn't match the viewport then skip it
    if ( sheet_media && sheet_media.length && ! window.matchMedia(sheet_media).matches ) return [];
    // get the style rules of this sheet
    return toArray(stylesheet.cssRules);
}

function _find(string: string, re: RegExp) {
    let matches = string.match(re);
    return matches ? matches.length : 0;
}

// calculates the specificity of a given `selector`
function calculateScore(selector: string) {
    let score = [0,0,0],
        parts = selector.split(' '),
        part, match;
    //TODO: clean the ':not' part since the last ELEMENT_RE will pick it up
    while (part = parts.shift(), typeof part == 'string') {
        // find all pseudo-elements
        match = _find(part, PSEUDO_ELEMENTS_RE);
        score[2] += match;
        // and remove them
        match && (part = part.replace(PSEUDO_ELEMENTS_RE, ''));
        // find all pseudo-classes
        match = _find(part, PSEUDO_CLASSES_RE);
        score[1] += match;
        // and remove them
        match && (part = part.replace(PSEUDO_CLASSES_RE, ''));
        // find all attributes
        match = _find(part, ATTR_RE);
        score[1] += match;
        // and remove them
        match && (part = part.replace(ATTR_RE, ''));
        // find all IDs
        match = _find(part, ID_RE);
        score[0] += match;
        // and remove them
        match && (part = part.replace(ID_RE, ''));
        // find all classes
        match = _find(part, CLASS_RE);
        score[1] += match;
        // and remove them
        match && (part = part.replace(CLASS_RE, ''));
        // find all elements
        score[2] += _find(part, ELEMENT_RE);
    }
    return parseInt(score.join(''), 10);
}

// returns the heights possible specificity score an element can get from a give rule's selectorText
function getSpecificityScore(element: Element, selector_text: string) {
    let selectors = selector_text.split(','),
        selector, score, result = 0;
    while (selector = selectors.shift()) {
        if (matchesSelector(element, selector)) {
            score = calculateScore(selector);
            result = score > result ? score : result;
        }
    }
    return result;
}

function sortBySpecificity(element: Element, rules: CSSStyleRule[]) {
    // comparing function that sorts CSSStyleRules according to specificity of their `selectorText`
    return rules.sort((a, b) => getSpecificityScore(element, b.selectorText) - getSpecificityScore(element, a.selectorText));
}

// Find correct matchesSelector impl
function matchesSelector(el: any, selector: any) {
  var matcher = el.matchesSelector || el.mozMatchesSelector || 
      el.webkitMatchesSelector || el.oMatchesSelector || el.msMatchesSelector;
  return matcher.call(el, selector);
}

//TODO: not supporting 2nd argument for selecting pseudo elements
//TODO: not supporting 3rd argument for checking author style sheets only
export const getMatchedCSSRules = (element: Element /*, pseudo, author_only*/) => {
    let style_sheets: CSSStyleSheet[] = []
    let sheet: CSSStyleSheet | undefined
    let rules: any[] = []
    let rule: any | undefined
    let result: CSSStyleRule[] = []
    // get stylesheets and convert to a regular Array
    style_sheets = toArray(element.ownerDocument.styleSheets);

    // assuming the browser hands us stylesheets in order of appearance
    // we iterate them from the beginning to follow proper cascade order
    while (sheet = style_sheets.shift()) {
        // get the style rules of this sheet
        rules = getSheetRules(sheet);
        // loop the rules in order of appearance
        while (rule = rules.shift()) {
            // if this is an @import rule
            if (rule.styleSheet) {
                // insert the imported stylesheet's rules at the beginning of this stylesheet's rules
                rules = getSheetRules(rule.styleSheet).concat(rules);
                // and skip this rule
                continue;
            }
            // if there's no stylesheet attribute BUT there IS a media attribute it's a media rule
            else if (rule.media) {
                // insert the contained rules of this media rule to the beginning of this stylesheet's rules
                rules = getSheetRules(rule).concat(rules);
                // and skip it
                continue
            }

            // check if this element matches this rule's selector
            if (matchesSelector(element, rule.selectorText)) {
                // push the rule to the results set
                result.push(rule);
            }
        }
    }
    // sort according to specificity
    return sortBySpecificity(element, result);
}

export function permute<T>(arr: Array<T>): Array<Array<T>> {
  var length = arr.length,
      result = [arr.slice()],
      c = new Array(length).fill(0),
      i = 1, k, p;

  while (i < length) {
    if (c[i] < i) {
      k = i % 2 && c[i];
      p = arr[i];
      arr[i] = arr[k];
      arr[k] = p;
      ++c[i];
      i = 1;
      result.push(arr.slice());
    } else {
      c[i] = 0;
      ++i;
    }
  }
  return result;
}

export function idle(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export function disjunctPipe<A extends ZodSchema, B extends ZodSchema>(a: A, b: B) {
  return a.pipe(b).or(b)
}

export function escapeRegex(str: string) {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')
}

export function emitCustomEvent<T extends {}>(emitter: HTMLElement, name: string, detail?: T, options: EventInit = {bubbles: true, composed: true}) {
  return emitter.dispatchEvent(new CustomEvent(name, {detail, ...options}))
}

const nav = typeof navigator != "undefined" ? navigator : null
const doc = typeof document != "undefined" ? document : null
const agent = (nav && nav.userAgent) || ""

const ie_edge = /Edge\/(\d+)/.exec(agent)
const ie_upto10 = /MSIE \d/.exec(agent)
const ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(agent)

const ie = !!(ie_upto10 || ie_11up || ie_edge)
export const ie_version = ie_upto10 ? (document as any).documentMode : ie_11up ? +ie_11up[1] : ie_edge ? +ie_edge[1] : 0
export const gecko = !ie && /gecko\/(\d+)/i.test(agent)
export const gecko_version = gecko && +(/Firefox\/(\d+)/.exec(agent) || [0, 0])[1]

const _chrome = !ie && /Chrome\/(\d+)/.exec(agent)
const chrome = !!_chrome
const chrome_version = _chrome ? +_chrome[1] : 0
const safari = !ie && !!nav && /Apple Computer/.test(nav.vendor)
// Is true for both iOS and iPadOS for convenience
const ios = safari && (/Mobile\/\w+/.test(agent) || !!nav && nav.maxTouchPoints > 2)
const mac = ios || (nav ? /Mac/.test(nav.platform) : false)
const windows = nav ? /Win/.test(nav.platform) : false
const android = /Android \d/.test(agent)
const webkit = !!doc && "webkitFontSmoothing" in doc.documentElement.style
const webkit_version = webkit ? +(/\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1] : 0

export const browser = {_chrome, chrome, chrome_version, safari, ios, mac, windows, android, webkit, webkit_version}

export function formatHTMLToPlainText(html: string): string {
  // Create a DOM parser to parse the HTML string
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Recursive function to traverse and extract text content
  function extractText(node: Node): string {
    let text = "";

    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        // Add text content
        text += (child as Text).textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = (child as Element).tagName.toLowerCase();

        // Add line breaks before certain elements
        if (
          tagName === "p" ||
          tagName === "h1" ||
          tagName === "h2" ||
          tagName === "h3"
        ) {
          text += "\n";
        }

        text += extractText(child);

        // Add line breaks after certain elements
        if (
          tagName === "p" ||
          tagName === "h1" ||
          tagName === "h2" ||
          tagName === "h3" ||
          tagName === "br"
        ) {
          text += "\n";
        }
      }
    });

    return text;
  }

  // Extract text from the document body
  const plainText = extractText(doc.body);

  // Remove extra line breaks and trim whitespace
  return plainText
    .replace(/\n\s*\n/g, "\n\n") // Replace multiple line breaks with a single double line break
    .trim(); // Trim leading and trailing whitespace
}

/** Lit attribute converter for whitespace-separated lists */
export const SpacedListAttributeConverter = {
  fromAttribute: (attr: string) => attr?.split(/\s+/),
  toAttribute: (prop: string[]) => prop.length? prop.join(" "): undefined
}

/** If condition dependent on editor state returns true, chain the commands - else, do nothing. */
export function chainCommandsIf(condition: (state: EditorState) => boolean, ...commands: Command[]): Command {
  return (s, d, v) => condition(s) && chainCommands(...commands)(s, d, v)
}

/** Parse a number string as a float, taking into account the decimal and thousand separator for the given locale.  */
export function parseLocaleNumber(str: string, locale=(document?.documentElement?.lang ?? navigator.language ?? "en")) {
  var thousandSeparator = Intl.NumberFormat(locale).format(11111).replace(/\p{Number}/gu, '');
  var decimalSeparator = Intl.NumberFormat(locale).format(1.1).replace(/\p{Number}/gu, '');

  return parseFloat(str
      .replace(new RegExp('\\' + thousandSeparator, 'g'), '')
      .replace(new RegExp('\\' + decimalSeparator), '.')
  );
}

export function textNodesUnder(el: Element) {
  const children = []
  const walker = el.ownerDocument.createTreeWalker(el, 4)
  while(walker.nextNode()) {
    children.push(walker.currentNode)
  }
  return children as Text[]
}


export function isObject(item: any) {
  return Boolean(item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
export function mergeDeep<T extends object, S extends object>(target: T, ...sources: S[]): T & S {
  if (!sources.length) return target as any;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject((source as any)[key])) {
        if (!(target as any)[key]) Object.assign(target, { [key]: {} });
        mergeDeep((target as any)[key], (source as any)[key]);
      } else {
        Object.assign(target, { [key]: (source as any)[key] });
      }
    }
  }

  return mergeDeep(target, ...sources) as T & S;
}


export function deepUpdate<T extends object>(obj: T, path: string[], value: any) {
  const [head, ...rest] = path
  !rest.length // @ts-ignore
      ? obj[head] = value // @ts-ignore
      : deepUpdate(obj[head], rest, value);
}