# Support printing

Keep the information readers need visible in print and provide a paper alternative when they would otherwise need to interact with the widget. For example, an observation log can show space for handwritten notes in place of its entry controls.

![An observation log provides space for handwritten notes on paper](../../images/widgets/printing.svg)

```css
/* In the widget's shadow styles */
.paper-notes { display: none; }

@media print {
  .entry-controls { display: none; }
  .paper-notes {
    display: block;
    min-block-size: 3rem;
    border-block-end: 1px solid currentColor;
  }
}
```

Add a `.paper-notes` element with a visible label such as “Observations” inside the shadow DOM. If CSS is insufficient, listen for the window's `beforeprint` and `afterprint` events, and remove those listeners when the widget disconnects.

Use print preview to check that text, borders, and page breaks remain readable. For a widget that cannot be represented on paper, show a short explanation.
