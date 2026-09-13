# Slides: a CSS-only carousel

Slides follows the [CSS-only carousel approach](https://css-tricks.com/css-only-carousel/): a horizontal flex container, native scrolling with CSS scroll snapping, and ordinary fragment links. The same authored navigation is used while editing and saved for readers. No presentation runtime, camera, thumbnails, or exported JavaScript is needed.

```html
<body class="ww-slides">
  <div class="ww-slides-viewport">
    <section class="ww-slide" id="slide-one" tabindex="-1">
      <h1 style="left:20px;top:20px;width:calc(100% - 40px);height:20%">A title</h1>
      <p style="left:20px;top:calc(20% + 40px);width:calc(100% - 40px);height:calc(80% - 60px)">Ordinary editable content.</p>
    </section>
    <section class="ww-slide" id="slide-two" tabindex="-1">
      <p>Another slide.</p>
    </section>
  </div>
  <nav class="ww-slides-navigation" aria-label="Slides" contenteditable="false">
    <a href="#slide-one" aria-label="Slide 1">1</a>
    <a href="#slide-two" aria-label="Slide 2">2</a>
  </nav>
</body>
```

The viewport, sections, IDs, and links are authored document structure. The navigation is part of the reader experience, as explicitly requested, and therefore belongs in the document rather than the shadow appendix. Grid/flex layouts, widgets, text, and media inside slides continue to use the existing editor tools.

The scoped authored stylesheet fits a 16:9 slide inside the browser viewport, centered with equal margins above/below or at the sides. The carousel spans the full viewport and uses `scroll-snap-type: x mandatory` and `scroll-snap-align: center`. Direct content elements are absolutely positioned relative to their slide; nested formatting, layouts, and widget internals retain their own layout. New slides start with an aligned H1 box and a paragraph box filling the remaining space, using the document's page gutter. Content outside a slide remains visible and editable in the surrounding margins while editing. Reader views and saved documents clip content at the slide boundary.

The authored navigation is positioned absolutely at the bottom left of the viewport. An appendix-only “+” sits beside the number bubbles, and a small “×” sits partly inside the top-right corner of each bubble to remove that slide. Previous/next fragment links sit at the left and right sides of each slide and are saved with the document. Motion respects `prefers-reduced-motion`. Print keeps each slide's 16:9 composition, adds page breaks, and hides the navigation.

## Editing

- The document layout selector offers Document, Canvas, and Slides.
- Empty documents offer both “Use canvas layout” and “Use slides layout”.
- Document → Slides moves existing content into one slide while preserving nodes, comments, SVG, and widgets, and records their placement as authored styles. Existing carousel structure is reused on re-entry; older flow-based decks receive measured positions when opened.
- Slides → Document removes the mode class and item placement, retaining the authored carousel structure and links in normal flow.
- Direct Canvas ↔ Slides conversion remains unavailable; convert through Document.
- Appendix add and per-bubble remove affordances enhance the bottom navigation; no separate editing bar is shown. Slide reordering remains available through the command API. Each explicit command updates the authored navigation and forms one undo operation. Minimum-content repair keeps at least one slide and an empty paragraph in otherwise empty slides. Observers preserve remote and widget-authored positioning.
- Existing move and resize controls operate on the slide's content boxes. Editor insertions reuse the canvas placement logic; splitting a large text box shares its space with its continuations.
- Slide and canvas items show their transform controls and dotted outline whenever a selection is inside them, including text, gaps, list points, table cells, and widget capture. The inner selection retains its normal caret, highlighting, and editing behavior.
- Dragging inside items selects their content. Their borders move them; corner and edge-center handles resize them. The separate move and layers controls are hidden for slide and canvas items. The rotation stem connects to the top-center resize handle. Moves, resizes, and rotations retain the current inner selection.
- Ordinary text editing cannot accidentally split or merge slide boundaries. Unsupported cross-slide structural edits are safe no-ops.

## Saving and iframe integration

HTML and offline exports use the normal serializer. They retain the carousel stylesheet and navigation without injecting scripts or copying editor controls. Readers can follow links or scroll even when scripting is disabled.

The editor and preview use `srcdoc` iframes, whose relative URLs resolve against the host page. The editor routes carousel fragment activation to its own location hash; preview copies use `about:srcdoc#…` links. This is an iframe compatibility adjustment. Saved authored links remain ordinary `#…` links.

## Validation

Focused tests cover empty-document choices, DOM identity, conversion guards, navigation updates, undo/redo, stale targets, slide boundaries, collaboration, and unchanged exported controls. Native Chrome checks exercise fragment navigation inside the editor and a saved document with scripting disabled. Run `npx vitest run`, `npm run typecheck`, and the existing loopback-only browser harness before handoff.
