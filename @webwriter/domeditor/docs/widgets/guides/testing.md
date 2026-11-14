# Test and debug

Package tests can check widget content and interactions in a document. The authoring tool can also show the widget's HTML and package warnings. These checks help identify problems before publication.

![A widget under a magnifying glass with a passing check](../../images/widgets/testing.svg)

Select **Run checks** to test the conversion and the result after restoring the original unit. Change a conversion factor in the source to see a check fail.

<!-- live-example: Unit converter checks -->

```js vanilla
class UnitConverter extends HTMLElement {
  static observedAttributes = ["unit"]
  #factors = {cm: 100, mm: 1000}

  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    root.innerHTML = `
      <p>1 m = <output></output></p>
      <button type="button">Run checks</button>
      <p role="status"></p>
    `
    root.querySelector("button").addEventListener("click", () => this.runChecks())
  }

  connectedCallback() { this.render() }
  attributeChangedCallback() { this.render() }

  render() {
    const unit = this.getAttribute("unit") || "cm"
    const value = this.#factors[unit]
    this.shadowRoot.querySelector("output").value = value ? `${value} ${unit}` : "Unknown unit"
  }

  runChecks() {
    const original = this.getAttribute("unit")
    const output = this.shadowRoot.querySelector("output")
    const originalValue = output.value
    this.setAttribute("unit", "mm")
    const conversionPassed = output.value === "1000 mm"
    if(original === null) this.removeAttribute("unit")
    else this.setAttribute("unit", original)
    const restorePassed = output.value === originalValue
    this.shadowRoot.querySelector('[role="status"]').textContent =
      !conversionPassed ? "Fail: expected 1000 mm."
      : !restorePassed ? "Fail: the original value did not return."
      : "2 checks passed."
  }
}

customElements.define("ww-unit-converter", UnitConverter)
```

```html
<ww-unit-converter unit="cm"></ww-unit-converter>
```

<!-- /live-example -->

Open the **Developer console** to examine package warnings, the selected element, and document HTML. Refresh the package when you change its built files. For automatic refresh, enable **Auto-reload**.

Do these checks for each widget.

- Save the document. Open it again. Make sure that the widget keeps the settings and authored content.
- Change an attribute from outside the widget. Check the display.
- Use undo and redo. Check the authored content.
- Test keyboard input, narrow layouts, preview, and printing.
- Wait for shared data before you write to it. Check that updates from other participants appear.

Export test modules as `./tests/<name>.js` or `./tests/<name>.*`. Run the modules from **Tests** in the **Developer console**. Each module runs in a separate frame with a time limit of 60 seconds.

To test a unit converter, change the saved target unit. Check that the widget calculates the new output. Use undo. Check that the widget restores the previous output. The [Ghost Disco test module](../examples/ghost-disco-tests.js) has a test without a test-runner dependency. For [Mocha](https://mochajs.org/getting-started/), `getMochaConfig()` from `@webwriter/build/test` supplies the reporting hooks.

The [test reporting reference](../reference/build-test.md#test-reporting) gives details for other test runners.

## Widget test cases

## Checks after saving and opening
