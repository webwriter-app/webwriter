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

Design block widgets for widths from **300px** up to the width they take: the prose width by default, and up to **2100px** when the widget or the document sets `--ww-widget-max: none` (see [Maximum width](#maximum-width)). Set [`min-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/min-height) to the minimum height for access to the controls. Set `max-height` to limit the height. Let the content set the height within these limits. Use scrolling to give readers access to content outside the view.

Use these host styles for a block widget. Change the height limits to suit the content. A canvas widget sizes its height differently, see [Height of canvas widgets](#height-of-canvas-widgets).

```css
:host {
  display: block;
  box-sizing: border-box;
  min-inline-size: min(300px, 100%);
  max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));
  min-block-size: 12rem;
  max-block-size: 36rem;
}
```

The `max-inline-size` line follows the document's maximum widget width. [Maximum width](#maximum-width) says which rule applies and how a widget takes the page width.

Use a [container query](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) to add columns when more space is available. A weather display can show current conditions and the forecast side by side in a wide container. It can put them in one column in a narrow container. Apply the query to a descendant in the shadow DOM. Use [`minmax(0, 1fr)`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/minmax) for flexible columns. Let long text wrap.

Test at 300px, 2100px, and intermediate widths. Test nested widgets. Test different browser zoom levels. Make sure that controls stay readable without horizontal scrolling. Check access to the content at the maximum widget height.

## Layout at different widths

Choose the layout from the width the widget has, not from the screen. Give the host `container-type: inline-size` and query its descendants in the shadow DOM. Start with one column and add columns as the container grows. Keep the order of the DOM the reading order, so that a stacked layout reads in the same order as a wide one.

```css
.layout { display: grid; gap: .75rem; grid-template-columns: minmax(0, 1fr); }

@container (inline-size >= 28rem) {
  .layout { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@container (inline-size >= 48rem) {
  .layout { grid-template-columns: 14rem minmax(0, 1fr); }
}
```

| Container width | Layout |
|---|---|
| Below about 28rem (a phone, a narrow column, a float) | One column. Controls above or below the content, full-width buttons where that helps. |
| About 28rem to 48rem (the prose width is 45rem) | Two columns for content, controls in a row. |
| 48rem and wider (only for a widget that takes the page width) | Controls or a legend beside the work area. Give the work area the extra space. |

The values are examples. Choose them from the space your controls need. A widget that keeps the prose maximum never gets wider than 45rem, so it needs no larger tier.

Zooming the browser to 200 % halves the width in CSS pixels, so the narrow layout is the one that a reader with low vision uses. Check it.

## Maximum width

The editor gives every installed block widget a maximum width. The rule is in a style element of the document (`webwriter-widget-sizing`), so it applies in edit mode, in preview, and in an exported page. In short:

```css
body :is(ww-my-widget) {
  max-inline-size: min(100%, var(--ww-widget-max, var(--ww-prose-max, 45rem)));
}
```

The theme rule wins over a `max-width` or `max-inline-size` in the widget's `:host` rule, because a rule of the document beats a `:host` rule of the same widget. A `max-inline-size: 2100px` in `:host` therefore has no effect. The widget states its preference with the property that the theme rule reads instead. A widget that sets `--ww-widget-max` on its host, or a document that sets it on the element, changes the result, and the document wins.

| Widget | Take | Declare in `:host` |
|---|---|---|
| Prose-like: quiz, card, form, short interactive text, anything that sits between paragraphs | The prose width, 45rem by default. It lines up with the text. | Nothing, or `max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem))` to have the same limit when the widget is nested. |
| Canvas, chart, map, diagram, table, code editor, timeline: content that gets better with more room | The page width, up to `--ww-page-max` (2160px) minus the gutters. | `--ww-widget-max: none;` |
| A fixed cap between the two | A length. | `--ww-widget-max: 60rem;` |

```css
:host {
  display: block;
  --ww-widget-max: none;
}
```

The value `none` removes the limit, so the widget fills the width that its parent gives it, up to the page. The widget still has to fit narrower parents: use container queries as above. The cap does not apply to documents with the canvas, slides, or board layout, which size their own children. Widgets inside the shadow DOM of another widget are not touched by the document rule.

## Height of canvas widgets

A widget that draws on a canvas or an SVG stage needs a height that follows its width, and an author must still be able to set a height. Use an `aspect-ratio` on the host, a minimum height, and a stage that fills the host.

```css
:host {
  display: block;
  inline-size: 100%;
  container-type: inline-size;
  aspect-ratio: 16 / 9;
  min-block-size: 12rem;
}

.stage { display: block; inline-size: 100%; block-size: 100%; }
```

The block size is then the width divided by the ratio, and never below `min-block-size`. Keep `inline-size: 100%`: without it, a height that an author sets would make the browser derive the width from the height and the ratio. Choose a ratio that suits the content, such as `4 / 3` for a diagram or `3 / 1` for a timeline. Size the drawing surface from the stage with a [`ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) if a library needs it.

Why on the host, and not `height: clamp(12rem, 50cqi, 36rem)`: [container query units](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries#container_query_length_units) such as `cqi` are relative to the nearest ancestor container. A host with `container-type` is the container of its descendants only, so on the host itself the units refer to a container outside the widget, while a stage inside gets the right value. Use `cqi` on descendants if you need it, and `aspect-ratio` for the host. Do not use a fixed pixel height for the whole widget: it is wrong at every width but one.

An authored height wins. A `height` or `block-size` that the author sets on the element, or that a document stylesheet sets, replaces the height from the ratio, and the stage follows because it fills the host. Do not remove the author's height with `!important` or script, and do not cap it with a `max-block-size` smaller than a reasonable height. If the widget has a height property of its own, such as `height`, apply it to the stage and switch the ratio off:

```css
:host([height]) { aspect-ratio: auto; }
```

```js
render() {
  return html`<div class="stage" style=${this.height ? `block-size: ${this.height}px` : nothing}></div>`
}
```

Widgets whose content sets the height (text, lists) use the min and max rules above and let the content decide.

## Overflow and nested widgets

Content that is wider than the widget scrolls inside the widget or wraps. It never makes the page scroll sideways. Give grid and flex children `min-inline-size: 0`, let long words wrap with `overflow-wrap: anywhere`, and put a wide table or a code block in its own region with `overflow: auto`. Give that region `tabindex="0"` and a label so that a keyboard can scroll it.

Do not put `overflow: hidden` on the host: it clips focus rings and shadows. A menu or a tooltip that is positioned inside the widget is clipped by any parent that scrolls or hides overflow. Show overlays with the [`popover`](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) attribute or a [`<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), which are drawn in the top layer.

A widget can sit inside another widget, in a column of a layout widget, in a float, or in a slot of a card. Make no assumption about the parent.

- Use the width the parent allocates. `min-inline-size: min(300px, 100%)` never forces a narrow parent to overflow, and `max-inline-size` follows `--ww-widget-max` as above. A child in the light DOM of another widget gets the theme rule, so it is capped at the prose width unless it declares `--ww-widget-max: none`.
- A container query in the shadow DOM finds the nearest ancestor container, which is your own host or a container you place in the template. A nested widget never answers for its parent, and the parent never answers for the child. Give an inner container a name when a query could match more than one: `container: tools / inline-size`, then `@container tools (inline-size >= 20rem)`.
- Do not compute from `window.innerWidth` or `document.documentElement.clientWidth`. A nested widget in a 300px column on a wide screen would lay out for the screen.
- A widget in a slot of another widget can be larger than the slot gives it. Test that the parent clips or scrolls what is too wide.

Test the widget alone, inside a 300px column, inside another instance of itself, and inside a float.
