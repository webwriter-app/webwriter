# Schema

`Schema` (in `src/schema.ts`) defines which nodes are allowed where in the document — a content model like HTML's. It powers validation (`isContentValid`, `canInsert`, …) and automatic correction (`fixInvalidContent`, `fillByRule`, …).

```js
import { Schema } from "./src/schema"

const schema = new Schema()                       // uses the built-in HTML schema
schema.isContentValid("ul", [schema.create("li")]) // true
schema.isContentValid("ul", [schema.create("p")])  // false
```

## Schema entries

A schema maps **type keys** to entries. Keys are tag names (`"p"`, `"ul"`), the special keys `"#text"`, `"#comment"` and `"#unknownelement"`, or namespaced keys like `"svg|rect"`.

```ts
type SchemaEntry = {
  group?: string[]              // group memberships, e.g. ["flow", "phrasing"]
  content?: ContentRule         // what the node may contain (omit = no content allowed)
  inseperable?: boolean         // must not be split apart (e.g. headings)
  defaultNode?: boolean         // created when no type is specified (base schema: "p")
  headOnly?: boolean            // only valid inside <head>
  contentNamespace?: string     // namespace URL for descendants (e.g. SVG)
  emptySelector?: string        // matches the element when "empty"
  placeholderStyle?, emptyStyle? // styles applied to empty/placeholder elements
  sideEffects?: boolean         // executing content (scripts, styles)
}
```

## Content rules

A `ContentRule` describes a node's content model. Every rule takes `min`/`max` occurrence bounds (both default to `1`). Rules are matched **statefully**: validating a node against a rule decrements its bounds in place, which is how a single rule is consumed across a sequence of children.

| Rule | Shape | Matches |
| --- | --- | --- |
| Selector | `{selector: "li"}` | elements by CSS selector |
| Node type | `{selector: {type: "text"}}` | text or comment nodes |
| Group | `{group: "phrasing"}` | members of a named group |
| Sequence | `{terms: [ruleA, ruleB]}` | the term rules, in order |
| Choice | `{options: [ruleA, ruleB]}` | any one of the options |
| Conjunction | `{conditions: [ruleA, ruleB]}` | nodes satisfying **all** conditions |
| Transparent | `{transparent: true, selector?}` | whatever the **parent's** rule allows |

```js
// <ul>: any number of <li>, <script> or <template>
{options: [{selector: "li"}, {selector: "script"}, {selector: "template"}], min: 0, max: Infinity}

// <html>: exactly <head> then <body>
{terms: [{selector: "head"}, {selector: "body"}]}

// <p>: phrasing content or text, unbounded
{options: [{group: "phrasing"}, {selector: {type: "text"}}], min: 0, max: Infinity}

// <a>: transparent (allows what its parent allows), minus interactive content
{transparent: true, selector: ":not(a):not(:has(a))" /* … */}
```

---

## Constructing & extending

### `new Schema(entries?)`

Creates a schema from the given entries, defaulting to `Schema.baseSchema` (the built-in HTML schema).

### `extend(extensionSchema)`

Adds or replaces entries and registers their group memberships. Use this to teach the editor custom elements:

```js
schema.extend({
  "my-widget": {
    group: ["flow"],
    content: {group: "phrasing", min: 0, max: Infinity}
  }
})
schema.getGroupMembers("flow").includes("my-widget") // true
schema.isContentValid(document.body, [schema.create("my-widget")]) // true
```

## Lookup

### `get(nodeOrKey)`

Returns the schema entry for a key or node. Elements resolve by tag name, unknown elements to `"#unknownelement"`, text/comment nodes to `"#text"`/`"#comment"`. Inside a namespace container, elements resolve to their namespaced entry:

```js
schema.get("ul")                          // the <ul> entry
schema.get(document.createElement("ul"))  // same entry
schema.get(document.createTextNode("x"))  // the "#text" entry

const svg = schema.create("svg"), rect = schema.create("svg|rect")
svg.append(rect)
schema.get(rect) === schema.get("svg|rect") // true
```

### `create(key?)`

Creates a new node of the given type. Defaults to the default node type (`<p>` in the base schema).

```js
schema.create()           // <p>
schema.create("#text")    // Text node
schema.create("svg|rect") // SVGRectElement with the SVG namespace
```

### `defaultNodeKey` / `defaultNodeType`

The key/entry marked `defaultNode: true`, falling back to `"#text"`.

### `getGroupMembers(group)`

A copy of the type keys in a group.

```js
schema.getGroupMembers("phrasing") // ["#text", "b", "i", "span", …]
```

### `isPhrasing(nodeOrKey)` / `isBlock(nodeOrKey)`

`isPhrasing` — whether the type belongs to the `"phrasing"` group. `isBlock` — whether the type is a *block*: an element you can type text into directly (allows `"#text"` content), that is not itself phrasing and not head-only.

```js
schema.isPhrasing("b")  // true
schema.isBlock("p")     // true   (holds text directly)
schema.isBlock("b")     // false  (is itself phrasing)
schema.isBlock("ul")    // false  (only holds <li>)
```

### Namespaces

`namespaceTypes` lists the entries defining a `contentNamespace` (base schema: `"svg"`, `"math"`). `getNamespaceURL(key)` returns the URL a type defines. `getNamespaceNameOfElement(el)` / `getNamespaceOfElement(el)` find the closest namespace container *above* an element:

```js
const svg = schema.create("svg"), rect = schema.create("svg|rect")
svg.append(rect)
schema.getNamespaceNameOfElement(rect) // "svg"
schema.getNamespaceOfElement(rect)     // "http://www.w3.org/2000/svg"
schema.getNamespaceNameOfElement(svg)  // undefined (the container itself doesn't count)
```

### `placeholderKeys`

Keys of types that show a placeholder when empty (those with an `emptySelector` plus a placeholder or empty style) — `["h1", "h2", …]` in the base schema.

---

## Validation

### `isNodeValid(node, rule?)`

Whether one node is valid as the *next* piece of content under `rule` (default: a clone of the parent element's content rule). **Stateful**: a successful match decrements the rule's bounds in place, so repeated calls with the same rule object consume it across a sequence of nodes.

```js
const li = () => document.createElement("li")

// fresh rule per call — positional state doesn't matter
schema.isNodeValid(li(), {selector: "li", max: Infinity}) // true

// shared rule — consumed across calls
const rule = {terms: [{selector: "head"}, {selector: "body"}]}
schema.isNodeValid(document.createElement("head"), rule) // true
schema.isNodeValid(document.createElement("body"), rule) // true
schema.isNodeValid(document.createElement("body"), rule) // false (sequence consumed)

// default rule: the node's parent
const ul = document.createElement("ul"); ul.append(li())
schema.isNodeValid(ul.firstChild)                        // true
```

Elements with `contenteditable="false"` are always valid (opaque embedded content).

### `isContentValid(nodeOrKey, content?, rule?)`

Whether `content` (default: the node's current children) is valid for the node. Validates every node against a shared rule and requires the rule's minimum to be satisfied. Elements without a content rule are valid only when empty.

```js
schema.isContentValid("ul", [schema.create("li")])  // true
schema.isContentValid("html", [])                   // false (head and body required)
schema.isContentValid(document.createElement("br")) // true  (void element, empty)
```

### `getInvalidChildNodes(el)` / `findInvalidNodes(root?)`

`getInvalidChildNodes` returns an element's children that are invalid at their position. `findInvalidNodes` walks the whole tree below `root` and collects every node whose *content* is invalid.

```js
document.body.innerHTML = "<div><ul><p>x</p></ul></div>"
schema.findInvalidNodes(document.body.firstElementChild) // [the <ul>]
```

### `findValidContentTypes(containerOrKey, rule?, content?)`

The type keys currently insertable into the container, respecting consumed bounds. Transparent rules resolve against the container's parent.

```js
schema.findValidContentTypes("ul")    // ["li", "script", "template"]
schema.findValidContentTypes("html")  // ["head"] (first unsatisfied term)

const p = schema.create("p"), slot = schema.create("slot")
p.append(slot)
schema.findValidContentTypes(slot)    // phrasing types — resolved through <p>
```

### `findValidTypesToInsert(range?)`

Like `findValidContentTypes`, but for a document position: the types insertable at the given range (default: the current selection).

```js
$.selectGap(document.body.firstElementChild)
schema.findValidTypesToInsert() // ["p", "div", …] — flow content in <body>
```

---

## Editing queries

All `can*` queries are non-destructive — they validate a *hypothetical* result.

### `canReplace(toReplace, replacement)`

Whether `toReplace` could be swapped for `replacement` within its parent.

```js
const ul = document.createElement("ul"); ul.append(schema.create("li"))
schema.canReplace(ul.firstChild, schema.create("li")) // true
schema.canReplace(ul.firstChild, schema.create("p"))  // false
```

### `canInsert(container, insertee, start, end?)`

Whether `insertee` may be inserted at index `start` (or replace the children from `start` to `end`).

```js
document.body.innerHTML = "<p>a</p>"
schema.canInsert(document.body, schema.create("p"), 1)     // true: insert after
schema.canInsert(document.body, schema.create("div"), 0, 1) // true: replace the <p>
schema.canInsert(document.body, schema.create("title"), 0)  // false: metadata only
```

### `canSplit(node, insertee?)`

Whether `node` can be split in two within its parent — i.e. whether the parent can hold the node, an optional insertee, and a clone of the node in its place.

```js
document.body.innerHTML = "<p>x</p>"
schema.canSplit(document.body.firstElementChild)  // true: two <p>s are fine in <body>
schema.canSplit(document.head)                    // false: <html> allows only one <head>
```

### `canWrap(wrapperOrKey, content)`

Whether the wrapper may contain `content`. Non-element wrappers (`"#text"`, `"#comment"`) never wrap.

```js
schema.canWrap("li", [document.createTextNode("hello")]) // true
schema.canWrap("ul", [schema.create("p")])               // false
```

### `getLiftTarget(node)`

Finds the nearest ancestor level `node` can be lifted to. Returns `[depth, replacement]` — `depth` counts levels above the node's parent (1 = replace the parent itself), and `replacement` is the lifted node, flanked by clones of the sliced parent holding copies of its former siblings. Returns `null` when no valid level exists or lifting would slice an `inseperable` parent. A pure query: the document is left unchanged.

```js
document.body.innerHTML = "<div><p>a</p><p>b</p><p>c</p></div>"
const [depth, replacement] = schema.getLiftTarget(document.querySelectorAll("p")[1])
// depth === 1
// replacement: [<div><p>a</p></div>, <p>b</p>, <div><p>c</p></div>]
```

---

## Correction

### `findWrapping(container, content)`

Finds an element type valid in `container` that can wrap `content`, and returns a new element of it — or `undefined` when nothing fits.

```js
schema.findWrapping(document.createElement("ul"), [schema.create("p")])
// <li> — the only thing in <ul> that can hold a <p>
```

### `findAlternativeIndex(container, content)`

The index closest to the content's current position where it could be moved to make the container valid, or `null`.

### `fillByRule(containerOrKey, rule?, content?)`

Returns content fulfilling the rule: keeps the valid nodes of `content` and creates any missing required nodes. Throws when the container allows no content or leftover content cannot be placed.

```js
schema.fillByRule("html").map(n => n.nodeName)          // ["HEAD", "BODY"]
schema.fillByRule("html", undefined, [myHead])          // [myHead, <body>]
```

### `fixInvalidContent(el)`

Makes the element's content valid: for each invalid child it attempts to **wrap** it, **lift** it, **move** it to a valid position, or **delete** it — then fills missing required content. If the content still cannot be made valid, the element itself is removed.

```js
document.body.innerHTML = "<ul>hello <b>world</b></ul>"
schema.fixInvalidContent(document.querySelector("ul"))
// <ul><li>hello <b>world</b></li></ul>
```

### `checkAndCorrect(root?, deep?)`

Runs `fixInvalidContent` on the root element (default: `document.documentElement`), and with `deep` on all descendants.

```js
schema.checkAndCorrect(document.body, true) // sanitize the whole document
```
