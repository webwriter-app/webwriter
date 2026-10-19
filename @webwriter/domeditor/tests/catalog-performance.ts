import {AppRibbon} from '../src/components/ribbon'
import {DomEditor} from '../src/components/dom-editor'
import type {WebWriterPackage} from '../src/packages'
import type {RibbonButton} from '../src/components/ribbon-button'
import {nothing} from 'lit'

function assert(value: unknown, message: string): asserts value {
  if(!value) throw new Error(message)
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const frames = async () => { for(let i = 0; i < 3; i++) await new Promise(requestAnimationFrame) }
class CatalogRibbon extends AppRibbon {
  renders = 0
  render() { this.renders++; return super.render() }
}
class CatalogHost extends DomEditor {
  renders = 0
  render() { this.renders++; return super.render() }
}
customElements.define('catalog-benchmark-ribbon', CatalogRibbon)
customElements.define('catalog-benchmark-host', CatalogHost)

const packages = (size: number): WebWriterPackage[] => Array.from({length: size}, (_, index) => ({
  name: `@benchmark/widget-${index}`, version: '1.0.0', label: `Widget ${index}`, description: 'Catalog benchmark',
  authors: ['Author'], license: 'MIT', keywords: ['widget-lang-en', 'widget-lang-de', 'widget-lang-fr'],
  links: {}, scripts: [], styles: [], members: [{id: `widget-${index}`, packageName: `@benchmark/widget-${index}`,
    packageVersion: '1.0.0', exportName: './widget', kind: 'widget', label: `Widget ${index}`, insertable: true, tagName: `benchmark-widget-${index}`}],
}))

/** Real Lit catalog rendering, with the former uncached formatter path as a
 * comparison. Both phases use identical data, markup and viewport dimensions. */
export async function benchmarkCatalogRendering() {
  const results: object[] = []
  const NativeDisplayNames = Intl.DisplayNames
  const displayNamesDescriptor = Object.getOwnPropertyDescriptor(Intl, 'DisplayNames')!
  let constructions = 0, lookups = 0
  class CountingDisplayNames extends NativeDisplayNames {
    constructor(locales: string | string[], options: Intl.DisplayNamesOptions) { constructions++; super(locales, options) }
    of(code: string) { lookups++; return super.of(code) }
  }
  Object.defineProperty(Intl, 'DisplayNames', {...displayNamesDescriptor, value: CountingDisplayNames})
  try {
    for(const size of [10, 100, 300]) {
      for(const baseline of [true, false]) {
        const ribbon = new CatalogRibbon()
        ribbon.style.width = '1600px'
        ribbon.settings = {...ribbon.settings, disableAI: true}
        ribbon.packages = packages(size)
        if(baseline) {
          // This benchmark's keywords are all language tags, so this exactly
          // recreates the old per-keyword constructor work and fresh details.
          ;(ribbon as any).packageDetails = (pkg: WebWriterPackage) => ({heading: pkg.label,
            subheading: `${pkg.name}@${pkg.version}`, description: pkg.description, authors: pkg.authors,
            keywords: pkg.keywords.map(keyword => ({label: new Intl.DisplayNames([navigator.language], {type: 'language'}).of(keyword.slice('widget-lang-'.length)), icon: 'KeywordLanguage'})),
          })
        }
        document.body.append(ribbon)
        try {
          await ribbon.updateComplete
          await frames()
          const buttons = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-button[variant="package"]')).filter(button => button.action.startsWith("package:"))
          assert(buttons.length === size, 'benchmark did not render the full catalog including overflow')
          const details = buttons.map(button => button.details)
          const run = async () => {
            ribbon.canMark = !ribbon.canMark
            await ribbon.updateComplete
            await Promise.all(buttons.map(button => button.updateComplete))
          }
          for(let i = 0; i < 3; i++) await run()
          constructions = 0; lookups = 0
          const times = []
          for(let i = 0; i < 20; i++) {
            const start = performance.now(); await run(); times.push(performance.now() - start)
          }
          times.sort((a, b) => a - b)
          if(!baseline) {
            assert(constructions === 0 && lookups === 0, 'warm catalog repeated language formatting')
            assert(buttons.every((button, index) => button.details === details[index]), 'unchanged package details lost their identity')
          }
          await delay(300)
          const settled = ribbon.renders
          await delay(200)
          const idleRenders = ribbon.renders - settled
          assert(idleRenders === 0, 'idle catalog has a self-sustaining Lit update loop')
          let resizeIdleRenders = 0
          if(!baseline && size === 300) {
            for(const width of [1000, 650, 1600]) {
              ribbon.style.width = `${width}px`
              window.dispatchEvent(new Event('resize'))
              await delay(300)
              const before = ribbon.renders
              await delay(200)
              resizeIdleRenders += ribbon.renders - before
            }
            assert(resizeIdleRenders === 0, 'responsive catalog layout oscillates between Lit updates')
          }
          results.push({packages: size, baseline, medianMs: +times[10].toFixed(3), maxMs: +times[19].toFixed(3),
            formatterConstructions: constructions, languageLookups: lookups, idleRenders, resizeIdleRenders})
        }
        finally { ribbon.remove() }
      }
    }
    // Exercise the actual host bindings without network, package downloads or
    // an editor iframe. Resolve startup only after disconnecting the fixture.
    const url = location.href
    history.replaceState(null, '', '?open=local:benchmark')
    const host = new CatalogHost() as any
    let finishStartup!: () => void
    host.loginToBackend = async () => {}
    host.restoreRecentDocuments = async () => {}
    host.restoreInstalledPackages = () => {}
    host.restoreLocalPackages = async () => {}
    host.loadPackageCatalog = async () => { host.packages = packages(100) }
    host.localPackageManager.connect = () => {}
    host.restoreLinkedDocument = () => new Promise<void>(resolve => { finishStartup = resolve })
    host.settings = {...host.settings, disableAI: true}
    document.body.append(host)
    try {
      await host.updateComplete
      await delay(300)
      const ribbon = (host.shadowRoot as ShadowRoot).querySelector<AppRibbon>('app-ribbon')!
      let childRenders = 0
      const render = ribbon.render.bind(ribbon)
      ribbon.render = () => { childRenders++; return render() }
      for(let i = 0; i < 20; i++) { host.canMark = !host.canMark; await host.updateComplete; await ribbon.updateComplete }
      await delay(300)
      const parentSettled = host.renders, childSettled = childRenders
      await delay(200)
      assert(host.renders === parentSettled && childRenders === childSettled, 'host/ribbon bindings have a Lit feedback loop')
      results.push({hostPackages: 100, selectionChanges: 20, idleHostRenders: host.renders - parentSettled, idleRibbonRenders: childRenders - childSettled})
    }
    finally {
      host.remove(); finishStartup(); history.replaceState(null, '', url)
      // Release the disconnected fixture's retained render tree.
      host.render = () => nothing; host.requestUpdate(); await host.updateComplete
    }
  }
  finally { Object.defineProperty(Intl, 'DisplayNames', displayNamesDescriptor) }
  return {name: 'catalog rendering and Lit settling', samples: results}
}
