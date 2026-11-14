# Make layouts responsive

A responsive widget changes its layout to fit the available space. It can move content into one column when the space is narrow or use more columns when space permits. Its controls stay available when the content scrolls.

![Widget columns reflow into a stack at narrow widths](../../images/widgets/responsiveness.svg)

<!-- live-example: Responsive card -->

```js vanilla
class ResponsiveCard extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <style>
        :host { display: block; max-inline-size: 100%; container-type: inline-size; }
        :host([compact]) { inline-size: 18rem; }
        .card { display: grid; gap: .5rem; padding: .75rem; border: 1px solid #b8c7d6; border-radius: .5rem; }
        .items { display: grid; gap: .5rem; }
        article { padding: .6rem; border-radius: .3rem; background: #eef5f8; }
        button { justify-self: start; }
        @container (min-width: 28rem) {
          .items { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      </style>
      <section class="card">
        <button type="button">Toggle width</button>
        <div class="items">
          <article><strong>Today</strong><br>Sort the seed packets</article>
          <article><strong>Tomorrow</strong><br>Label the garden beds</article>
        </div>
      </section>`
    this.shadowRoot.querySelector("button").addEventListener("click", () =>
      this.toggleAttribute("compact"))
  }

  connectedCallback() {
    this.toggleAttribute("compact", this.hasAttribute("compact"))
  }
}

customElements.define("ww-responsive-card", ResponsiveCard)
```

```html
<ww-responsive-card></ww-responsive-card>
```

<!-- /live-example -->

Design block widgets for widths from **300px to 2100px**. Set [`min-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/min-height) to the minimum height for access to the controls. Set `max-height` to limit the height. Let the content set the height within these limits. Use scrolling to give readers access to content outside the view.

Use these host styles for a block widget. Change the height limits to suit the content.

```css
:host {
  display: block;
  box-sizing: border-box;
  min-width: 300px;
  max-width: 2100px;
  min-height: 12rem;
  max-height: 36rem;
}
```

Use a [container query](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) to add columns when more space is available. A weather display can show current conditions and the forecast side by side in a wide container. It can put them in one column in a narrow container. Apply the query to a descendant in the shadow DOM. Use [`minmax(0, 1fr)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/minmax) for flexible columns. Let long text wrap.

Test at 300px, 2100px, and intermediate widths. Test nested widgets. Test different browser zoom levels. Make sure that controls stay readable without horizontal scrolling. Check access to the content at the maximum widget height.

## Layout at different widths

## Overflow and nested widgets
