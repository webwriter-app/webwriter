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
    && Object.keys(obj1).every(key => Object.hasOwn(obj2, key) 
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

/** Return a range of numbers up to `a` or starting at `a` and up to, but excluding `b`.
 */
export function range(a: number, b?: number) {
  return [...Array((b ?? a*2) - a).keys()].map(x => x + (b? a: 0))
}

export {default as groupBy} from "lodash.groupby"


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