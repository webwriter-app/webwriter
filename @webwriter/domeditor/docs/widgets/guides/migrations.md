# Migrate widget content

A migration updates saved widget markup when an author pastes it, drops it, or inserts a snippet. It can change old attributes or elements and keep the authored content. This lets authors use content from earlier [package versions](https://docs.npmjs.com/about-semantic-versioning/).

![The old lang-code attribute becomes term-lang while child content is preserved](../../images/widgets/migrations.svg)

<!-- live-example: Migrate an old glossary -->

```js vanilla
document.addEventListener("migrate", event => {
  const widget = event.target
  if(widget.localName !== "ww-glossary" || !widget.hasAttribute("lang-code")) return
  if(!widget.hasAttribute("term-lang")) {
    widget.setAttribute("term-lang", widget.getAttribute("lang-code"))
  }
  widget.removeAttribute("lang-code")
})

class GlossaryWidget extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <slot></slot>
      <button type="button">Migrate content</button>`
    this.shadowRoot.querySelector("button").addEventListener("click", () => {
      this.dispatchEvent(new Event("migrate", {bubbles: true}))
    })
  }
}

customElements.define("ww-glossary", GlossaryWidget)
```

```html
<ww-glossary lang-code="nl">
  <p><strong>fiets</strong> — a bicycle</p>
</ww-glossary>
```

<!-- /live-example -->

Export `./migrate.js` to supply a migration. The migration runs in a sandbox outside the live document.

For example, a glossary widget can change the name of its language attribute and keep the authored definition.

```js
document.addEventListener("migrate", event => {
  const widget = event.target
  if(widget.localName !== "ww-glossary" || !widget.hasAttribute("lang-code")) return
  if(!widget.hasAttribute("term-lang")) {
    widget.setAttribute("term-lang", widget.getAttribute("lang-code"))
  }
  widget.removeAttribute("lang-code")
})
```

This example changes one attribute and keeps all other content. On a second run, the old attribute is absent and the migration makes no changes.

[`event.detail`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail) contains `{packageName, version}` for the installed package. Examine the input element to identify its format. Complete the migration within three seconds. Use only data that is available in the sandbox.

Test old, current, and unusual valid HTML. Keep unrelated attributes, namespaces, child nodes, and comments. See the [package manifest reference](../reference/distribution.md).

## Package versions and migration rules

## Tests for existing content
