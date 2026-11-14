# Overview: Widgets

Widgets add interactive content to a web document. They are [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components). An [npm package](https://docs.npmjs.com/about-packages-and-modules/) can contain one or more widgets.

This documentation has multiple sections: The [Library](introduction/library.md) page describes the six choices in the library selector. The [Quick start](introduction/quick-start.md) shows how to add a widget to a document. The [Tutorial](tutorial/index.md) shows how to make a complete widget. Both include source code and a live preview for each library. The [Guides](guides/index.md) give instructions for specific widget features. The [Reference](reference/index.md) describes the package interface, runtime interface, and tools. The [Sandbox](sandbox.md) lets you edit and run a basic widget.

## What is a widget?

A widget is an HTML [custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements). Its class can extend [`HTMLElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement) directly or use a base class from a library such as [Lit](https://lit.dev/docs/components/defining/). A widget can use the web APIs that the browser supplies.

<!-- live-example: Weather -->

```js vanilla
class WeatherWidget extends HTMLElement {
  static observedAttributes = ["contenteditable", "fixed"]
  static forecasts = {
    Utrecht: "12 °C · Cloudy",
    Amsterdam: "11 °C · Rainy",
    Rotterdam: "13 °C · Windy",
  }

  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    const style = document.createElement("style")
    style.textContent = `
      :host { display: block; }
      .forecast {
        user-select: none;
        display: grid;
        gap: .35rem;
        padding: .65rem;
        border: 1px solid #b8d4df;
        border-radius: .5rem;
        background: #f2f9fc;
      }
      .heading, .report {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: .35rem;
      }
      slot { font-weight: bold; }
      p { margin: 0; }
      label, button { font-size: .8125rem; }
    `
    const panel = document.createElement("div")
    panel.className = "forecast"
    const heading = document.createElement("div")
    heading.className = "heading"
    this.fixedLabel = document.createElement("label")
    this.fixedLabel.hidden = true
    this.fixedInput = document.createElement("input")
    this.fixedInput.type = "checkbox"
    this.fixedInput.addEventListener("change", () => {
      this.toggleAttribute("fixed", this.fixedInput.checked)
    })
    this.fixedLabel.append(this.fixedInput, "Fixed")
    heading.append(document.createElement("slot"), this.fixedLabel)

    const report = document.createElement("div")
    report.className = "report"
    this.forecast = document.createElement("p")
    this.nextCity = document.createElement("button")
    this.nextCity.type = "button"
    this.nextCity.textContent = "Next city"
    this.nextCity.addEventListener("click", () => {
      const cities = Object.keys(WeatherWidget.forecasts)
      const data = this.readData()
      const current = cities.indexOf(data.place || "Utrecht")
      this.writeData({...data, place: cities[(current + 1) % cities.length]})
    })
    report.append(this.forecast, this.nextCity)
    panel.append(heading, report)
    root.append(style, panel)
    this.dataObserver = new MutationObserver(() => this.updateForecast())
  }

  connectedCallback() {
    this.dataObserver.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: ["type", "slot"],
    })
    this.fixedLabel.hidden = !this.isContentEditable
    this.updateForecast()
  }

  disconnectedCallback() {
    this.dataObserver.disconnect()
  }

  attributeChangedCallback() {
    this.fixedLabel.hidden = !this.isContentEditable
    this.fixedInput.checked = this.hasAttribute("fixed")
    this.nextCity.disabled = this.fixedInput.checked
  }

  get dataElement() {
    return this.querySelector(':scope > script[type="application/json"][slot="data"]')
  }

  readData() {
    try {
      const data = JSON.parse(this.dataElement?.textContent ?? "null")
      return data && typeof data === "object" && !Array.isArray(data) ? data : {}
    } catch {
      return {}
    }
  }

  writeData(data) {
    const json = JSON.stringify(data).replaceAll("<", "\\u003c")
    const existing = this.dataElement
    if(existing) {
      existing.textContent = json
      return
    }
    const script = document.createElement("script")
    script.type = "application/json"
    script.slot = "data"
    script.textContent = json
    this.append(script)
  }

  updateForecast() {
    const value = this.readData().place
    const place = typeof value === "string" && value ? value : "Utrecht"
    const forecast = Object.hasOwn(WeatherWidget.forecasts, place)
      ? WeatherWidget.forecasts[place]
      : "No sample forecast"
    this.forecast.textContent = `${place} · ${forecast}`
  }
}

customElements.define("ww-weather", WeatherWidget)
```

```js shared #weather-example weather-data.js
const selector = ':scope > script[type="application/json"][slot="data"]'

export function readWeatherData(host) {
  try {
    const data = JSON.parse(host.querySelector(selector)?.textContent ?? "null")
    return data && typeof data === "object" && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

export function writeWeatherData(host, data) {
  let block = host.querySelector(selector)
  if(!block) {
    block = document.createElement("script")
    block.type = "application/json"
    block.slot = "data"
    host.append(block)
  }
  const json = JSON.stringify(data).replaceAll("<", "\\u003c")
  block.textContent = json
}

export function observeWeather(host, update) {
  const observer = new MutationObserver(update)
  observer.observe(host, {
    subtree: true,
    childList: true,
    characterData: true,
    attributeFilter: ["contenteditable", "fixed", "slot", "type"],
  })
  return () => observer.disconnect()
}

export const weatherStyles = `
:host { display: block; }
.forecast {
  user-select: none;
  display: grid;
  gap: .35rem;
  padding: .65rem;
  border: 1px solid #b8d4df;
  border-radius: .5rem;
  background: #f2f9fc;
}
.heading, .report {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .35rem;
}
slot { font-weight: bold; }
p { margin: 0; }
label, button { font-size: .8125rem; }
`
```

```js lit
import {LitElement, css, html} from "lit"

class WeatherWidget extends LitElement {
  static styles = css`
    :host { display: block; }
    .forecast {
      user-select: none;
      display: grid;
      gap: .35rem;
      padding: .65rem;
      border: 1px solid #b8d4df;
      border-radius: .5rem;
      background: #f2f9fc;
    }
    .heading, .report {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .35rem;
    }
    slot { font-weight: bold; }
    p { margin: 0; }
    label, button { font-size: .8125rem; }
  `

  static forecasts = {
    Utrecht: "12 °C · Cloudy",
    Amsterdam: "11 °C · Rainy",
    Rotterdam: "13 °C · Windy",
  }

  dataObserver = new MutationObserver(() => this.requestUpdate())

  connectedCallback() {
    super.connectedCallback()
    this.dataObserver.observe(this, {
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: ["contenteditable", "fixed", "slot", "type"],
    })
    this.requestUpdate()
  }

  disconnectedCallback() {
    this.dataObserver.disconnect()
    super.disconnectedCallback()
  }

  get dataElement() {
    return this.querySelector(':scope > script[type="application/json"][slot="data"]')
  }

  readData() {
    try {
      const data = JSON.parse(this.dataElement?.textContent ?? "null")
      return data && typeof data === "object" && !Array.isArray(data) ? data : {}
    } catch {
      return {}
    }
  }

  writeData(data) {
    const existing = this.dataElement
    const script = existing ?? document.createElement("script")
    const json = JSON.stringify(data).replaceAll("<", "\\u003c")
    script.textContent = json
    if(!existing) {
      script.type = "application/json"
      script.slot = "data"
      this.append(script)
    }
  }

  nextCity() {
    const data = this.readData()
    const cities = Object.keys(WeatherWidget.forecasts)
    const current = cities.indexOf(data.place || "Utrecht")
    this.writeData({...data, place: cities[(current + 1) % cities.length]})
  }

  render() {
    const {place: value} = this.readData()
    const place = typeof value === "string" && value ? value : "Utrecht"
    const forecasts = WeatherWidget.forecasts
    const forecast = Object.hasOwn(forecasts, place) ? forecasts[place] : "No sample forecast"
    const fixed = this.hasAttribute("fixed")

    return html`
      <div class="forecast">
        <div class="heading">
          <slot></slot>
          <label ?hidden=${!this.isContentEditable}>
            <input
              type="checkbox"
              .checked=${fixed}
              @change=${event => this.toggleAttribute("fixed", event.target.checked)}
            >
            Fixed
          </label>
        </div>
        <div class="report">
          <p>${place} · ${forecast}</p>
          <button type="button" ?disabled=${fixed} @click=${this.nextCity}>Next city</button>
        </div>
      </div>
    `
  }
}

customElements.define("ww-weather", WeatherWidget)
```

```js react
import {createElement as h} from "react"
import {flushSync} from "react-dom"
import {createRoot} from "react-dom/client"
import {
  observeWeather, readWeatherData, writeWeatherData, weatherStyles,
} from "#weather-example"

function Forecast({place, forecast, editing, fixed, fixedInput, nextCity}) {
  return h("div", {className: "forecast"},
    h("div", {className: "heading"},
      h("slot"),
      h("label", {hidden: !editing},
        h("input", {
          type: "checkbox",
          defaultChecked: fixed,
          ref: fixedInput,
        }),
        "Fixed",
      ),
    ),
    h("div", {className: "report"},
      h("p", null, `${place} · ${forecast}`),
      h("button", {type: "button", disabled: fixed, onClick: nextCity}, "Next city"),
    ),
  )
}

class WeatherWidget extends HTMLElement {
  static forecasts = {
    Utrecht: "12 °C · Cloudy",
    Amsterdam: "11 °C · Rainy",
    Rotterdam: "13 °C · Windy",
  }

  constructor() {
    super()
    const shadow = this.attachShadow({mode: "open"})
    const style = document.createElement("style")
    style.textContent = weatherStyles
    this.mount = document.createElement("div")
    shadow.append(style, this.mount)
  }

  connectedCallback() {
    this.root = createRoot(this.mount)
    this.stopObserving = observeWeather(this, () => this.render())
    flushSync(() => this.render())
  }

  disconnectedCallback() {
    this.stopObserving()
    this.root.unmount()
  }

  nextCity() {
    const data = readWeatherData(this)
    const cities = Object.keys(WeatherWidget.forecasts)
    const current = cities.indexOf(data.place || "Utrecht")
    writeWeatherData(this, {...data, place: cities[(current + 1) % cities.length]})
  }

  render() {
    const {place: value} = readWeatherData(this)
    const place = typeof value === "string" && value ? value : "Utrecht"
    const forecasts = WeatherWidget.forecasts
    const forecast = Object.hasOwn(forecasts, place) ? forecasts[place] : "No sample forecast"

    this.root.render(h(Forecast, {
      place,
      forecast,
      editing: this.isContentEditable,
      fixed: this.hasAttribute("fixed"),
      fixedInput: input => {
        if(!input) return
        input.checked = this.hasAttribute("fixed")
        input.onchange = () => this.toggleAttribute("fixed", input.checked)
      },
      nextCity: () => this.nextCity(),
    }))
  }
}

customElements.define("ww-weather", WeatherWidget)
```

```vue vue
<script setup>
import {computed, onMounted, onBeforeUnmount, ref, useHost} from "vue"
import {readWeatherData, writeWeatherData, observeWeather, weatherStyles} from "#weather-example"

const host = useHost()
const forecasts = {
  Utrecht: "12 °C · Cloudy",
  Amsterdam: "11 °C · Rainy",
  Rotterdam: "13 °C · Windy",
}
const cities = Object.keys(forecasts)
const data = ref(readWeatherData(host))
const fixed = ref(host.hasAttribute("fixed"))
const editing = ref(host.isContentEditable)
const place = computed(() => data.value.place || "Utrecht")
const forecast = computed(() => Object.hasOwn(forecasts, place.value) ? forecasts[place.value] : "No sample forecast")

let stopObserving
let styleElement
onMounted(() => {
  styleElement = document.createElement("style")
  styleElement.textContent = weatherStyles
  host.shadowRoot.append(styleElement)
  stopObserving = observeWeather(host, () => {
    data.value = readWeatherData(host)
    fixed.value = host.hasAttribute("fixed")
    editing.value = host.isContentEditable
  })
})
onBeforeUnmount(() => {
  stopObserving?.()
  styleElement?.remove()
})

function nextCity() {
  if(fixed.value) return
  const index = cities.indexOf(place.value)
  writeWeatherData(host, {...readWeatherData(host), place: cities[(index + 1) % cities.length]})
}
</script>

<template>
  <section class="forecast">
    <div class="heading">
      <slot></slot>
      <label v-if="editing"><input type="checkbox" :checked="fixed" @change="host.toggleAttribute('fixed', $event.target.checked); fixed = $event.target.checked"> Fixed</label>
    </div>
    <div class="report">
      <p>{{ place }} · {{ forecast }}</p>
      <button type="button" :disabled="fixed" @click="nextCity">Next city</button>
    </div>
  </section>
</template>
```

```js vue-registration
import {defineCustomElement} from "vue"
import WeatherWidget from "./WeatherWidget.vue"

customElements.define("ww-weather", defineCustomElement(WeatherWidget))
```

```js angular
import "@angular/compiler"
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  ViewEncapsulation,
} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"
import {
  observeWeather,
  readWeatherData,
  weatherStyles,
  writeWeatherData,
} from "#weather-example"

class WwWeather {
  static forecasts = {
    Utrecht: "12 °C · Cloudy",
    Amsterdam: "11 °C · Rainy",
    Rotterdam: "13 °C · Windy",
  }

  host = inject(ElementRef).nativeElement
  changeDetector = inject(ChangeDetectorRef)
  report = ""
  stopObserving

  ngOnInit() {
    this.stopObserving = observeWeather(this.host, () => {
      this.updateReport()
      this.changeDetector.detectChanges()
    })
    this.updateReport()
  }

  ngOnDestroy() {
    this.stopObserving?.()
  }

  setFixed(event) {
    const checkbox = event.currentTarget
    this.host.toggleAttribute("fixed", checkbox.checked)
  }

  nextCity() {
    const cities = Object.keys(WwWeather.forecasts)
    const data = readWeatherData(this.host)
    const current = cities.indexOf(data.place || "Utrecht")
    writeWeatherData(this.host, {
      ...data,
      place: cities[(current + 1) % cities.length],
    })
    this.updateReport()
  }

  updateReport() {
    const data = readWeatherData(this.host)
    const value = data.place
    const place = typeof value === "string" && value ? value : "Utrecht"
    const forecast = Object.hasOwn(WwWeather.forecasts, place)
      ? WwWeather.forecasts[place]
      : "No sample forecast"
    this.report = `${place} · ${forecast}`
  }
}

Component({
  selector: "ww-weather-view",
  standalone: true,
  template: `
    <div class="forecast">
      <div class="heading">
        <slot></slot>
        <label [hidden]="!host.isContentEditable">
          <input
            type="checkbox"
            [checked]="host.hasAttribute('fixed')"
            (change)="setFixed($event)"
          >
          Fixed
        </label>
      </div>
      <div class="report">
        <p aria-live="polite">{{ report }}</p>
        <button type="button" [disabled]="host.hasAttribute('fixed')" (click)="nextCity()">
          Next city
        </button>
      </div>
    </div>
  `,
  styles: [weatherStyles],
  encapsulation: ViewEncapsulation.ShadowDom,
})(WwWeather)

async function register() {
  if(customElements.get("ww-weather")) return

  const app = await createApplication()
  const AngularWeatherElement = createCustomElement(WwWeather, {
    injector: app.injector,
  })

  class WwWeatherElement extends AngularWeatherElement {
    connectedCallback() {
      const version = this.getAttribute("ng-version")
      super.connectedCallback()
      // Keep Angular's runtime stamp out of the authored HTML.
      if(version === null) this.removeAttribute("ng-version")
      else this.setAttribute("ng-version", version)
    }
  }

  customElements.define("ww-weather", WwWeatherElement)
}

await register()
```

```svelte svelte
<svelte:options customElement={{tag: "ww-weather"}} />

<script>
  import {onMount} from "svelte"
  import {readWeatherData, writeWeatherData, observeWeather, weatherStyles} from "#weather-example"

  const host = $host()
  const forecasts = {
    Utrecht: "12 °C · Cloudy",
    Amsterdam: "11 °C · Rainy",
    Rotterdam: "13 °C · Windy",
  }
  const cities = Object.keys(forecasts)
  let data = $state(readWeatherData(host))
  let fixed = $state(host.hasAttribute("fixed"))
  let editing = $state(host.isContentEditable)
  let place = $derived(data.place || "Utrecht")
  let forecast = $derived(Object.hasOwn(forecasts, place) ? forecasts[place] : "No sample forecast")

  onMount(() => {
    const style = document.createElement("style")
    style.textContent = weatherStyles
    host.shadowRoot.append(style)
    const stopObserving = observeWeather(host, () => {
      data = readWeatherData(host)
      fixed = host.hasAttribute("fixed")
      editing = host.isContentEditable
    })
    return () => {
      stopObserving()
      style.remove()
    }
  })

  function nextCity() {
    if(fixed) return
    const index = cities.indexOf(place)
    writeWeatherData(host, {...readWeatherData(host), place: cities[(index + 1) % cities.length]})
  }

  function setFixed(event) {
    host.toggleAttribute("fixed", event.currentTarget.checked)
    fixed = event.currentTarget.checked
  }
</script>

<section class="forecast">
  <div class="heading">
    <slot></slot>
    {#if editing}
      <label><input type="checkbox" checked={fixed} onchange={setFixed} /> Fixed</label>
    {/if}
  </div>
  <div class="report">
    <p>{place} · {forecast}</p>
    <button type="button" disabled={fixed} onclick={nextCity}>Next city</button>
  </div>
</section>
```

```html
<ww-weather>
  <p>Schoolyard forecast</p>
  <script type="application/json" slot="data">{"place":"Utrecht"}</script>
</ww-weather>
```

<!-- /live-example -->

The tag name identifies the widget. A [JSON data block](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script#embedding_data_in_html) stores the city in `place`. Click **Next city** in the preview to change the forecast and update `place` in the Document HTML pane. In editing mode, select **Fixed** to set the `fixed` [attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes) and keep the current city. The widget uses a [shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) for its user interface. The [slot](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot) displays the authored paragraph.

A widget package can also include HTML snippets, style sheets, and tests. The authoring tool uses the package to find and load the widgets.

The HTML document holds each widget and its saved settings. Widgets and authors can change this HTML. The authoring tool can undo or redo a change.

### What widgets can do

<nav class="widget-capabilities" aria-labelledby="what-widgets-can-do">
  <div class="widget-capabilities-map">
    <div class="widget-capabilities-core">
      <div class="widget-capabilities-document">
        <strong class="widget-capabilities-document-title">HTML document</strong>
        <div class="widget-capabilities-lines" aria-hidden="true"></div>
        <div class="widget-capabilities-example">
          <div class="widget-capabilities-example-title"><strong>Widget</strong><code>&lt;ww-weather&gt;</code></div>
          <div class="widget-capabilities-example-output" aria-hidden="true">
            <strong>Schoolyard forecast</strong>
            <span>Utrecht · 12 °C · Cloudy</span>
          </div>
        </div>
        <div class="widget-capabilities-lines" aria-hidden="true"></div>
      </div>
    </div>
    <div class="widget-capabilities-rail widget-capabilities-left">
      <h4>Authoring</h4>
      <ul>
        <li>
          <a href="guides/editing.md" aria-describedby="widget-guide-editing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#editing"></use></svg>
            <template><img src="../images/widgets/editing.svg" alt=""></template>
            <span>Support editing</span>
          </a>
          <p id="widget-guide-editing" class="widget-capabilities-summary">A widget can show different controls to authors and readers.</p>
        </li>
        <li>
          <a href="guides/focus.md" aria-describedby="widget-guide-focus">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#focus"></use></svg>
            <template><img src="../images/widgets/focus.svg" alt=""></template>
            <span>Handle selection &amp; input</span>
          </a>
          <p id="widget-guide-focus" class="widget-capabilities-summary">A widget can move focus to a control and handle input from a keyboard.</p>
        </li>
        <li>
          <a href="guides/content.md" aria-describedby="widget-guide-content">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#content"></use></svg>
            <template><img src="../images/widgets/content.svg" alt=""></template>
            <span>Nest content</span>
          </a>
          <p id="widget-guide-content" class="widget-capabilities-summary">Slots can show editable text and other widgets from the light DOM.</p>
        </li>
        <li>
          <a href="guides/conversions.md" aria-describedby="widget-guide-conversions">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#conversions"></use></svg>
            <template><img src="../images/widgets/conversions.svg" alt=""></template>
            <span>Convert &amp; import/export</span>
          </a>
          <p id="widget-guide-conversions" class="widget-capabilities-summary">A widget can convert content to and from HTML or a file.</p>
        </li>
      </ul>
      <h4>Presentation</h4>
      <ul>
        <li>
          <a href="guides/responsiveness.md" aria-describedby="widget-guide-responsiveness">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#responsiveness"></use></svg>
            <template><img src="../images/widgets/responsiveness.svg" alt=""></template>
            <span>Make layouts responsive</span>
          </a>
          <p id="widget-guide-responsiveness" class="widget-capabilities-summary">A widget can change its layout to fit the available space.</p>
        </li>
        <li>
          <a href="guides/theming.md" aria-describedby="widget-guide-theming">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#theming"></use></svg>
            <template><img src="../images/widgets/theming.svg" alt=""></template>
            <span>Follow the theme</span>
          </a>
          <p id="widget-guide-theming" class="widget-capabilities-summary">A widget can use the fonts and colors from the document theme.</p>
        </li>
        <li>
          <a href="guides/localization.md" aria-describedby="widget-guide-localization">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#localization"></use></svg>
            <template><img src="../images/widgets/localization.svg" alt=""></template>
            <span>Localize a widget</span>
          </a>
          <p id="widget-guide-localization" class="widget-capabilities-summary">A widget can show its text in the document language.</p>
        </li>
        <li>
          <a href="guides/printing.md" aria-describedby="widget-guide-printing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#printing"></use></svg>
            <template><img src="../images/widgets/printing.svg" alt=""></template>
            <span>Support printing</span>
          </a>
          <p id="widget-guide-printing" class="widget-capabilities-summary">Print styles can show the widget content on paper or in a PDF.</p>
        </li>
      </ul>
    </div>
    <div class="widget-capabilities-rail widget-capabilities-right">
      <h4>State and participation</h4>
      <ul>
        <li>
          <a href="guides/state.md" aria-describedby="widget-guide-state">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#state"></use></svg>
            <template><img src="../images/widgets/state.svg" alt=""></template>
            <span>Manage state</span>
          </a>
          <p id="widget-guide-state" class="widget-capabilities-summary">A widget can store its state and supply options and actions to the authoring tool.</p>
        </li>
        <li>
          <a href="guides/sharing.md" aria-describedby="widget-guide-sharing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#sharing"></use></svg>
            <template><img src="../images/widgets/sharing.svg" alt=""></template>
            <span>Share participant data</span>
          </a>
          <p id="widget-guide-sharing" class="widget-capabilities-summary">A widget can store data for one participant, a group, or all participants.</p>
        </li>
        <li>
          <a href="guides/live-sessions.md" aria-describedby="widget-guide-live-sessions">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#live-sessions"></use></svg>
            <template><img src="../images/widgets/live-sessions.svg" alt=""></template>
            <span>Support live sessions</span>
          </a>
          <p id="widget-guide-live-sessions" class="widget-capabilities-summary">A widget can give participants controls and show their responses to the host.</p>
        </li>
        <li>
          <a href="guides/reactivity.md" aria-describedby="widget-guide-reactivity">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#reactivity"></use></svg>
            <template><img src="../images/widgets/reactivity.svg" alt=""></template>
            <span>Make data reactive</span>
          </a>
          <p id="widget-guide-reactivity" class="widget-capabilities-summary">A signal can update one widget when a value changes in another widget.</p>
        </li>
      </ul>
      <h4>Build and distribution</h4>
      <ul>
        <li>
          <a href="guides/libraries.md" aria-describedby="widget-guide-libraries">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#libraries"></use></svg>
            <template><img src="../images/widgets/libraries.svg" alt=""></template>
            <span>Manage dependencies</span>
          </a>
          <p id="widget-guide-libraries" class="widget-capabilities-summary">A widget can load libraries and assets as necessary. An offline document can include only the code it needs.</p>
        </li>
        <li>
          <a href="guides/testing.md" aria-describedby="widget-guide-testing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#testing"></use></svg>
            <template><img src="../images/widgets/testing.svg" alt=""></template>
            <span>Test and debug</span>
          </a>
          <p id="widget-guide-testing" class="widget-capabilities-summary">Package tests can help you find problems in a widget.</p>
        </li>
        <li>
          <a href="guides/migrations.md" aria-describedby="widget-guide-migrations">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#migrations"></use></svg>
            <template><img src="../images/widgets/migrations.svg" alt=""></template>
            <span>Migrate widget content</span>
          </a>
          <p id="widget-guide-migrations" class="widget-capabilities-summary">A migration can update widget HTML from an earlier version and keep the document content.</p>
        </li>
        <li>
          <a href="guides/publishing.md" aria-describedby="widget-guide-publishing">
            <svg aria-hidden="true" width="32" height="32"><use href="../images/widgets/capability-icons.svg#publishing"></use></svg>
            <template><img src="../images/widgets/publishing.svg" alt=""></template>
            <span>Publish a widget</span>
          </a>
          <p id="widget-guide-publishing" class="widget-capabilities-summary">You can publish a widget package or embed the widget on a website.</p>
        </li>
      </ul>
    </div>
  </div>
  <div class="widget-capabilities-preview" popover="manual" hidden aria-hidden="true"></div>
</nav>
