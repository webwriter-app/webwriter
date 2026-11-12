import {test} from 'node:test'
import assert from 'node:assert/strict'
import {GlobalRegistrator} from '@happy-dom/global-registrator'

GlobalRegistrator.register()
const {Signal: LitSignal} = await import('@lit-labs/signals')
const {LitElementWw, Signal, computed, html, signal} = await import('./index.js')
class LanguageWidget extends LitElementWw {
  locales = []
  localize = {setLocale: async locale => {this.locales.push(locale)}, getLocale: () => this.lang}
  createRenderRoot() {return this}
}
customElements.define('language-test-widget', LanguageWidget)

test('language inherits only while no lang attribute is authored', async () => {
  const parent = document.createElement('section')
  parent.lang = 'de'
  const widget = document.createElement('language-test-widget')
  parent.append(widget)
  document.body.append(parent)
  try {
    await widget.updateComplete
    assert.equal(widget.lang, 'de')
    assert.equal(widget.hasAttribute('lang'), false)
    parent.lang = 'en'
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(widget.lang, 'en')
    assert.equal(widget.hasAttribute('lang'), false)
    assert.equal(widget.locales.at(-1), 'en')

    widget.setAttribute('lang', '')
    assert.equal(widget.getAttribute('lang'), '')
    assert.equal(widget.lang, '')
    const calls = widget.locales.length
    parent.lang = 'fr'
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(widget.lang, '')
    assert.equal(widget.getAttribute('lang'), '')
    assert.equal(widget.locales.length, calls)

    widget.removeAttribute('lang')
    assert.equal(widget.hasAttribute('lang'), false)
    assert.equal(widget.lang, 'fr')
    assert.equal(widget.locales.at(-1), 'fr')
    widget.lang = ''
    assert.equal(widget.getAttribute('lang'), '')
    assert.equal(widget.lang, '')
  }
  finally {parent.remove()}
})

test('LitElementWw renders signals from the shared polyfill and tracks them after reconnection', async () => {
  assert.equal(Signal, LitSignal)
  const temperature = new LitSignal.State(20)
  const fahrenheit = computed(() => temperature.get() * 1.8 + 32)
  const unit = signal('°F')
  class TemperatureWidget extends LitElementWw {
    createRenderRoot() {return this.attachShadow({mode: 'open'})}
    renders = 0
    render() {
      this.renders++
      return html`<output>${fahrenheit} ${unit.get()}</output>`
    }
  }
  customElements.define('temperature-test-widget', TemperatureWidget)
  const widget = document.createElement('temperature-test-widget')
  document.body.append(widget)
  try {
    await widget.updateComplete
    const output = widget.shadowRoot.querySelector('output')
    assert.equal(output.textContent, '68 °F')

    temperature.set(25)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(output.textContent, '77 °F')
    assert.equal(widget.renders, 1)

    unit.set('F')
    await widget.updateComplete
    assert.equal(output.textContent, '77 F')
    assert.equal(widget.renders, 2)

    widget.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    temperature.set(30)
    document.body.append(widget)
    await widget.updateComplete
    assert.equal(output.textContent, '86 F')
    assert.equal(widget.shadowRoot.querySelector('output'), output)
  }
  finally {widget.remove()}
})
