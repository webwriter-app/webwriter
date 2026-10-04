import {test} from 'node:test'
import assert from 'node:assert/strict'
import {GlobalRegistrator} from '@happy-dom/global-registrator'

GlobalRegistrator.register()
const {LitElementWw} = await import('./index.js')
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
