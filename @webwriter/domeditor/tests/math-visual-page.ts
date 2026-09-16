import {DOMEditor} from "../src/domeditor"
import {auditMathVisuals, selectMathVisualPosition} from "./math-visual"

const automated = new URLSearchParams(location.search).has("run")
const report = (result: unknown) => fetch("/__native-result", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(result)})
const editor = new DOMEditor()
const fixture = document.createElement("div")
fixture.style.cssText = "width:280px;margin:24px;min-height:80px"
document.body.append(fixture)
const gallery = document.createElement("main")
gallery.style.cssText = "font:14px system-ui;width:calc(100vw - 96px);max-width:1100px;margin:32px 0;color:#0f172a"
editor.addAppendix(gallery)
gallery.innerHTML = `<h1>Formula placeholder and caret audit</h1>
<p>Before typing (left) and after inserting x (right). Dashed boxes are actual editor placeholders; red lines show caret geometry. Empty native ranges use slot bounds as a diagnostic and are reported as unverified, never passed. Use “Edit this position” to inspect the browser’s real blinking caret at the top of the page.</p>
<p>21 structures · every empty argument · populated token offsets · boundaries around structures · 16/32px · LTR/RTL · inline/block · 1 CSS px tolerance. Empty argument carets fit the current placeholder at the inserted character’s height; other vertical measurements follow the unchanged trailing z baseline.</p>
<p><a href="./math-root-regression.html">Root focus and formula-edge regression fixture</a></p>
<h2 id="summary">Running browser layout checks…</h2>
<label>Structure <select id="structure"><option value="">All structures</option></select></label>
<label style="margin-left:16px"><input type="checkbox" id="failures"> Failures only</label>
<label style="margin-left:16px"><input type="checkbox" id="placeholders"> Empty placeholders only</label>
<button id="download" type="button" style="margin-left:16px">Download measurements</button>
<div id="cards"></div>`
try {
  await document.fonts.ready
  const results = await auditMathVisuals(editor, fixture, !automated)
  const failed = results.filter(result => result.errors.length)
  const placeholders = results.filter(result => result.position.label.startsWith("empty argument"))
  gallery.querySelector("#summary")!.textContent = `${results.length} positions · ${failed.length} failures / unverified carets · ${placeholders.filter(result => !result.errors.length).length}/${placeholders.length} empty placeholders pass`
  const structures = gallery.querySelector<HTMLSelectElement>("#structure")!
  for(const name of new Set(results.map(result => result.structure))) structures.add(new Option(name, name))
  structures.value = "Fraction"
  const failures = gallery.querySelector<HTMLInputElement>("#failures")!
  const emptyOnly = gallery.querySelector<HTMLInputElement>("#placeholders")!
  const cards = gallery.querySelector<HTMLElement>("#cards")!
  const render = () => {
    cards.replaceChildren()
    for(const result of results.filter(result => (!structures.value || result.structure === structures.value)
      && (!failures.checked || result.errors.length) && (!emptyOnly.checked || result.position.label.startsWith("empty argument")))) {
      const card = document.createElement("section")
      card.style.cssText = `border:1px solid ${result.errors.length ? "#ef4444" : "#94a3b8"};border-radius:8px;padding:12px;margin:12px 0;background:white`
      const title = document.createElement("strong")
      title.textContent = result.name
      const detail = document.createElement("p")
      detail.textContent = result.errors.join("; ") || "PASS: placeholders clear; caret agrees within 1 CSS px"
      const source = document.createElement("small")
      source.textContent = result.source
      const edit = document.createElement("button")
      edit.type = "button"
      edit.textContent = "Edit this position"
      edit.style.marginLeft = "16px"
      edit.onclick = () => {
        selectMathVisualPosition(editor, fixture, result)
        fixture.scrollIntoView({block: "start"})
      }
      const comparison = document.createElement("div")
      comparison.style.cssText = "display:flex;gap:16px;overflow-x:auto;align-items:flex-start"
      comparison.append(result.before, result.after)
      card.append(title, comparison, detail, source, edit)
      cards.append(card)
    }
  }
  structures.onchange = render
  failures.onchange = render
  emptyOnly.onchange = render
  const measurements = results.map(({before, after, html, position, ...result}) => result)
  gallery.querySelector<HTMLButtonElement>("#download")!.onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(measurements, null, 2)], {type: "application/json"}))
    const link = document.createElement("a")
    link.href = url
    link.download = "math-visual-measurements.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  if(automated) await report({checks: results.map(result => ({name: result.name, ...(result.errors.length ? {error: result.errors.join("; ")} : {})}))})
  else render()
}
catch(error) {
  gallery.querySelector("#summary")!.textContent = `Audit failed: ${String(error)}`
  if(automated) await report({error: String(error)})
  else console.error(error)
}
