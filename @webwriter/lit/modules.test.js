// The module bindings on LitElementWw. What needs layout or real input is checked in a browser.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {GlobalRegistrator} from '@happy-dom/global-registrator'

GlobalRegistrator.register()
// LitElementWw and the modules warn in Lit's development build, which sets this.
globalThis.litIssuedWarnings ??= new Set()
const {html} = await import('lit')
const {LitElementWw} = await import('./index.js')
const {CoreController} = await import('./base.js')
const {Permissions, widgetPermissions} = await import('./permissions.js')
const {Settings} = await import('./settings.js')
const {jsonData} = await import('./data.js')
const {Exercise, exerciseOptions, scoreOf} = await import('./exercise.js')
const {Shortcuts} = await import('./shortcuts.js')
const {Help} = await import('./help.js')
const {matchLocale} = await import('./localize.js')
const {ModuleCore} = await import('@webwriter/widget/base')

const settled = () => new Promise(resolve => setTimeout(resolve, 0))
/** Waits until a condition holds, for what arrives with a real import. */
async function until(condition, timeout = 2000) {
  for(const start = Date.now(); !condition(); await settled()) if(Date.now() - start > timeout) throw new Error(`timed out waiting for ${condition}`)
}
/** happy-dom has no scoped registries, so the test widgets attach a plain shadow root. */
class TestWidget extends LitElementWw {
  createRenderRoot() {return this.attachShadow({mode: 'open'})}
}
let count = 0
/** Defines a widget class and puts one instance into the document, inside optional wrapper markup. */
async function mount(Class, {wrapper = '<div>', attributes = {}, content = ''} = {}) {
  const tag = `module-test-${++count}`
  customElements.define(tag, Class)
  const template = document.createElement('template')
  template.innerHTML = wrapper
  const outer = template.content.firstElementChild
  const widget = document.createElement(tag)
  for(const [name, value] of Object.entries(attributes)) widget.setAttribute(name, value)
  widget.innerHTML = content
  outer.append(widget)
  document.body.append(outer)
  await widget.updateComplete
  return {widget, outer, remove: () => outer.remove()}
}
/** The `console.warn` messages while `run` runs. */
async function warnings(run) {
  const seen = []
  const original = console.warn
  console.warn = message => seen.push(String(message))
  try {await run()}
  finally {console.warn = original}
  return seen
}

test('a binding connects its core with the host, refreshes it after a render and renders on a change', async () => {
  const log = []
  class Counter extends ModuleCore {
    #count = {value: 0}
    getSnapshot() {return this.#count}
    add() {this.#count = {value: this.#count.value + 1}; this.notify()}
    onConnect() {log.push('connect'); this.cleanup(() => log.push('disconnect'))}
    onRefresh() {log.push(`refresh ${this.root === this.host.shadowRoot}`)}
  }
  class Widget extends TestWidget {
    counter = new CoreController(this, root => new Counter(this, {root}))
    render() {return html`<output>${this.counter.snapshot.value}</output>`}
  }
  const {widget, remove} = await mount(Widget)
  try {
    assert.deepEqual(log, ['connect', 'refresh true'])
    widget.counter.core.add()
    await widget.updateComplete
    assert.equal(widget.shadowRoot.querySelector('output').textContent, '1')
    assert.deepEqual(log, ['connect', 'refresh true', 'refresh true'])
  }
  finally {remove()}
  assert.equal(log.at(-1), 'disconnect')
})

test('Permissions answers from the mode and the granted attributes, and hides marked elements', async () => {
  class Widget extends TestWidget {
    static properties = {allowReordering: {type: Boolean, attribute: 'allow-reordering', reflect: true}}
    static permissions = {allowReordering: {label: {_: 'Reorder'}}, allowReset: {attribute: 'resettable'}}
    #permissions = new Permissions(this, {editing: () => this.hasAttribute('editing')})
    can(name) {return this.#permissions.can(name)}
    render() {return html`<button data-ww-can="allowReordering">Sort</button><button data-ww-can="edit">Author</button><ww-inner></ww-inner>`}
  }
  const {widget, remove} = await mount(Widget)
  try {
    const [sort, author] = widget.shadowRoot.querySelectorAll('button')
    assert.equal(widget.can('allowReordering'), false)
    assert.equal(sort.hidden && author.hidden, true)
    widget.setAttribute('allow-reordering', '')
    await settled()
    await widget.updateComplete
    assert.equal(widget.can('allowReordering'), true)
    assert.equal(widget.can('allowReset'), false)
    assert.equal(widget.can('unknown'), false)
    assert.equal(sort.hidden, false)
    assert.equal(author.hidden, true)
    widget.setAttribute('resettable', '')
    assert.equal(widget.can('allowReset'), true)
    widget.setAttribute('editing', '')
    await settled()
    await widget.updateComplete
    assert.equal(widget.can('edit'), true)
    assert.equal(author.hidden, false)
  }
  finally {remove()}
})

test('a public member that holds a binding is reported once, by LitElementWw alone', async () => {
  class Widget extends TestWidget {
    permissions = new Permissions(this)
  }
  let mounted
  const seen = await warnings(async () => (mounted = await mount(Widget)))
  mounted.remove()
  assert.equal(seen.length, 1)
  assert.match(seen[0], /uses "permissions" for a value that conflicts with the WebWriter widget API/)
})

test('Settings makes reflected properties and declares a negative boolean as inverted', async () => {
  const declarations = {
    population: {type: Number, default: 200, min: 10, max: 2000, label: {_: 'Population'}},
    showChart: {type: Boolean, default: true},
    layout: {type: 'select', default: 'grid', options: [{value: 'grid'}, {value: 'rows'}]},
  }
  class Widget extends Settings(TestWidget, declarations) {
    static options = {title: {type: String}}
    render() {return html`<input data-ww-setting="population" type="number">`}
  }
  class Legacy extends Settings(TestWidget, declarations, {negativeBooleans: 'property'}) {}
  const {widget, remove} = await mount(Widget, {attributes: {population: '500', 'no-show-chart': ''}})
  const legacy = await mount(Legacy)
  try {
    assert.equal(widget.population, 500)
    assert.equal(widget.showChart, false)
    assert.equal(widget.layout, 'grid')
    assert.equal(widget.shadowRoot.querySelector('input').value, '500')
    assert.deepEqual(widget.options, {
      title: {type: String},
      population: {type: Number, min: 10, max: 2000, label: {_: 'Population'}, attribute: 'population'},
      showChart: {type: Boolean, attribute: 'no-show-chart', inverted: true},
      layout: {type: 'select', options: [{value: 'grid'}, {value: 'rows'}], attribute: 'layout'},
    })
    // The editor writes the negative attribute itself; the property follows.
    widget.removeAttribute('no-show-chart')
    assert.equal(widget.showChart, true)
    widget.showChart = false
    widget.population = 99999
    widget.layout = 'circle'
    await widget.updateComplete
    assert.equal(widget.hasAttribute('no-show-chart'), true)
    assert.equal(widget.getAttribute('population'), '2000')
    assert.equal(widget.layout, 'grid')
    // A default is never written to the document.
    widget.population = 200
    await widget.updateComplete
    assert.equal(widget.hasAttribute('population'), false)
    assert.deepEqual(legacy.widget.options.showChart, {type: Boolean, attribute: false})
  }
  finally {remove(); legacy.remove()}
})

test('the data binding works on the public widgetRuntime and leaves the data hooks alone', async () => {
  const hooks = []
  class Widget extends TestWidget {
    data_ = jsonData(this, {defaults: {count: 0}, block: 'document', editing: () => false})
    dataChanged(value) {hooks.push(value)}
    render() {return html`<output>${this.data_.get().count}</output>`}
  }
  const {widget, remove} = await mount(Widget, {content: '<script type="application/json">{"count": 2}</script>'})
  try {
    // The hook is the method of the class: nothing wrapped it on the instance.
    assert.equal(Object.hasOwn(widget, 'dataChanged'), false)
    assert.equal(widget.dataChanged, Widget.prototype.dataChanged)
    assert.equal(widget.shadowRoot.querySelector('output').textContent, '2')
    widget.data_.set({count: 3})
    assert.equal(widget.data_.unsaved, true)
    await settled()
    await widget.updateComplete
    assert.deepEqual(JSON.parse(widget.widgetRuntime.getSnapshot().data), {count: 3})
    assert.equal(widget.shadowRoot.querySelector('output').textContent, '3')
    // A change from outside reaches the binding and the widget's own hook.
    widget.querySelector('script').textContent = '{"count": 7}'
    await settled()
    await widget.updateComplete
    assert.equal(widget.shadowRoot.querySelector('output').textContent, '7')
    assert.equal(hooks.at(-1), '{"count": 7}')
  }
  finally {remove()}
})

/** What Exercise needs of ElementInternals, where the DOM of the tests lacks a part of it. */
const internals = () => ({value: undefined, validity: {}, setFormValue(value) {this.value = value}, setValidity(flags) {this.validity = flags}})

test('Exercise declares its actions through the getter of the class, not on the instance', async () => {
  class Widget extends TestWidget {
    static formAssociated = true
    static actions = {shuffle: {label: {_: 'Shuffle'}}}
    static options = {...exerciseOptions}
    response = undefined
    exercise = new Exercise(this, {
      internals: internals(),
      response: () => this.response,
      respond: response => (this.response = response),
      solution: () => ['a', 'b'],
      record: () => {},
      score: (response, solution) => scoreOf((response ?? []).map((id, index) => id === solution[index])),
      showSolution: 'allowSolution',
      editing: () => false,
    })
    get actions() {return this.exercise.actions}
    check() {this.exercise.check()}
    reset() {this.exercise.reset()}
    showSolution() {this.exercise.showSolution()}
    shuffle() {}
  }
  let mounted
  const seen = await warnings(async () => (mounted = await mount(Widget)))
  const {widget, remove} = mounted
  try {
    assert.deepEqual(seen, [])
    assert.equal(Object.hasOwn(widget, 'actions'), false)
    assert.deepEqual(Object.keys(widget.actions), ['shuffle', 'check', 'reset', 'showSolution'])
    assert.deepEqual(widget.actions.shuffle, {label: {_: 'Shuffle'}})
    assert.equal(widget.actions.check.label._, 'Check')
    assert.equal(widget.actions.check.disabled, false)
    assert.equal(widget.actions.reset.disabled, true)
    // The availability is current at every read, and a change is announced to the editor.
    const events = []
    widget.addEventListener('optionschange', () => events.push('optionschange'))
    widget.exercise.respond(['a', 'x'])
    await settled()
    await widget.updateComplete
    assert.equal(widget.actions.reset.disabled, false)
    assert.ok(events.length >= 1)
    widget.check()
    assert.deepEqual({...widget.exercise.result}, {correct: 1, total: 2, marks: [true, false]})
    assert.equal(widget.exercise.summary, '1 of 2 correct.')
    assert.equal(widget.constructor.options.feedback.label._, 'Feedback')
  }
  finally {remove()}
})

test('a widget that forgets the actions getter is told how to write it', async () => {
  class Widget extends TestWidget {
    static formAssociated = true
    exercise = new Exercise(this, {internals: internals(), response: () => undefined, respond: () => {}, solution: () => 1, record: () => {}, score: () => scoreOf([true])})
    check() {}
    reset() {}
  }
  let mounted
  const seen = await warnings(async () => (mounted = await mount(Widget)))
  try {
    assert.equal(seen.length, 1)
    assert.match(seen[0], /get actions\(\) \{ return this\.#exercise\.actions \}/)
    assert.equal('actions' in mounted.widget, false)
  }
  finally {mounted.remove()}
})

test('module text follows the effective language of the widget runtime and arrives per language', async () => {
  class Widget extends TestWidget {
    static actions = {duplicate: {shortcut: 'Mod+Shift+Delete', label: {_: 'Duplicate'}}}
    shortcuts = new Shortcuts(this)
    help = new Help(this)
    renders = 0
    duplicate() {}
    render() {
      this.renders++
      return html`<button data-ww-shortcut="duplicate">${this.shortcuts.labelsOf('duplicate').join()}</button>`
    }
  }
  const {widget, outer, remove} = await mount(Widget, {wrapper: '<section lang="de-AT">'})
  try {
    const button = widget.shadowRoot.querySelector('button')
    assert.equal(widget.lang, 'de-AT')
    // English until the German catalog is in, then the widget renders again.
    assert.match(button.textContent, /^(Ctrl\+Shift\+Delete|⇧⌘⌦)$/)
    const before = widget.renders
    await until(() => widget.renders > before)
    assert.match(button.textContent, /^(Strg\+Umschalt\+Entf|⇧⌘⌦)$/)
    outer.lang = 'en'
    await until(() => !button.textContent.startsWith('Strg'))
    assert.match(button.textContent, /^(Ctrl\+Shift\+Delete|⇧⌘⌦)$/)
    // The catalog is kept: German is back without another wait for an import.
    outer.lang = 'de'
    await settled()
    await widget.updateComplete
    assert.match(button.textContent, /^(Strg\+Umschalt\+Entf|⇧⌘⌦)$/)
  }
  finally {remove()}
})

test('the localization binding matches a language tag to the locales of a widget', () => {
  assert.equal(matchLocale('de-CH', 'en', ['de', 'fr']), 'de')
  assert.equal(matchLocale('zh-TW', 'en', ['zh-Hans', 'zh-Hant']), 'zh-Hant')
})
