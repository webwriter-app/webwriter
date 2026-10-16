import {LitElement, css, html} from "lit"
import {language, setLanguage, siteLanguages, siteLanguageKey, preferredLanguage, t, translateSiteTree, SiteLanguageController} from "./site-language"

class SiteLanguageSwitcher extends LitElement {
  private locale = new SiteLanguageController(this)
  static styles = css`
    :host {display: inline-block; margin-inline-start: auto; font: inherit; color: #536174}
    select {font: inherit; color: #263142; background: white; border: 1px solid #dfe5ed; border-radius: .35rem; padding: .5rem; max-inline-size: 100%; cursor: pointer}
    select:focus-visible {outline: 2px solid #155e9b; outline-offset: 3px}
  `
  render() {
    return html`<select aria-label=${t("Choose language")} .value=${language()} @change=${(event: Event) => setLanguage((event.target as HTMLSelectElement).value)}>
      ${Object.entries(siteLanguages).map(([code, label]) => html`<option value=${code} lang=${code} ?selected=${language() === code}>${label}</option>`)}
    </select>`
  }
}
if(!customElements.get("site-language-switcher")) customElements.define("site-language-switcher", SiteLanguageSwitcher)

function localizePage() {
  const docs = location.pathname.startsWith("/docs/")
  document.documentElement.lang = docs ? "en" : language()
  const roots = docs ? document.querySelectorAll(".site-header, .site-footer, .skip-link") : [document]
  for(const root of roots) {
    translateSiteTree(root)
    if(root instanceof HTMLElement) root.lang = language()
  }
}
localizePage()
window.addEventListener("site-language-change", localizePage)
window.addEventListener("storage", event => {
  if(event.key !== siteLanguageKey && event.key !== null) return
  setLanguage(preferredLanguage(navigator.languages, event.newValue), false)
})
