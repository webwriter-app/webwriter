# Support printing

Sometimes, authors want a printed version of a web document. Keep the question visible and provide a paper alternative to interactive controls.

```css
/* In the widget's shadow styles */
.paper-answer { display: none; }

@media print {
  .controls, output { display: none; }
  .paper-answer {
    display: block;
    min-block-size: 3rem;
    border-block-end: 1px solid currentColor;
  }
}
```

Add a `.paper-answer` element inside the shadow DOM. If CSS is insufficient, listen for the window's `beforeprint` and `afterprint` events, and remove those listeners when the widget disconnects.

Use print preview to check that text, borders, and page breaks remain readable. For a widget that cannot be represented on paper, show a short explanation.
