import * as Y from "yjs"
import {DOMEditor} from "../src/domeditor"
import {sharedDOMBody} from "../src/domdoc"

type Check = {name: string, error?: string}
const checks: Check[] = []
const check = async (name: string, run: () => void | Promise<void>) => {
  try { await run(); checks.push({name}) }
  catch(error) { checks.push({name, error: String(error)}) }
}
const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }
const editor = new DOMEditor()

await check("native Range and Selection", () => {
  const text = document.querySelector("#baseline")!.firstChild!
  const range = document.createRange()
  range.setStart(text, 1)
  range.setEnd(text, 2)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  assert(selection.toString() === "t", `unexpected selection: ${selection}`)
})

await check("designMode editing", () => {
  assert(document.designMode === "on", `expected designMode on, got ${document.designMode}`)
  assert(document.execCommand("insertText", false, "!") , "insertText was rejected")
  assert(document.querySelector("#baseline")!.textContent === "S!art", "native editing did not change the selected text")
})

await check("atomic widget editability survives serialization", () => {
  const widget = document.createElement("smoke-widget")
  widget.setAttribute("contenteditable", "false")
  widget.textContent = "Atomic"
  document.body.append(widget)
  editor.doc.syncFromDOM()
  assert(editor.doc.body.toString().includes('contenteditable="false"'), "Yjs mirror lost contenteditable=false")
  assert(editor.toHTML(true).includes('<smoke-widget contenteditable="false">Atomic</smoke-widget>'), "serialized widget lost its atomic editability")
})

await check("shadow appendix stays out of authored serialization", () => {
  const artifact = document.createElement("span")
  artifact.id = "smoke-appendix-artifact"
  artifact.textContent = "Editor UI"
  editor.appendix.append(artifact)
  assert(editor.appendix.contains(artifact), "fixture was not added to the appendix")
  assert(!editor.toHTML().includes("smoke-appendix-artifact"), "appendix artifact leaked into serialized document")
})

await check("Yjs remote updates and local undo", () => {
  const remote = new Y.Doc()
  try {
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(editor.doc.doc), "initial-sync")
    const body = sharedDOMBody(remote)
    const paragraph = body.firstChild as Y.XmlElement
    body.insert(body.length, [new Y.XmlElement("aside")])
    const aside = body.get(body.length - 1) as Y.XmlElement
    aside.insert(0, [new Y.XmlText("Remote")])
    Y.applyUpdate(editor.doc.doc, Y.encodeStateAsUpdate(remote), "remote-client")
    assert(editor.toHTML(true).includes("Remote"), "remote Yjs update did not reach the live document")
    editor.doc.stopCapturing()
    document.querySelector("#baseline")!.textContent = "Local"
    editor.doc.syncFromDOM()
    editor.doc.stopCapturing()
    editor.doc.undo()
    assert(document.querySelector("#baseline")!.textContent === "S!art", "local undo did not restore the state before the local edit")
    assert(document.body.contains(document.querySelector("aside")), "undo removed remote content")
    assert(paragraph.length > 0, "remote document was not initialized")
  }
  finally { remote.destroy() }
})

await check("SVG and MathML namespaces survive serialization", () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
  rect.setAttribute("width", "12")
  svg.append(rect)
  const math = document.createElementNS("http://www.w3.org/1998/Math/MathML", "math")
  const mi = document.createElementNS("http://www.w3.org/1998/Math/MathML", "mi")
  mi.textContent = "x"
  math.append(mi)
  document.body.append(svg, math)
  const parsed = new DOMParser().parseFromString(editor.toHTML(), "text/html")
  assert(parsed.querySelector("svg")?.namespaceURI === "http://www.w3.org/2000/svg", "SVG namespace changed")
  assert(parsed.querySelector("math")?.namespaceURI === "http://www.w3.org/1998/Math/MathML", "MathML namespace changed")
})

await check("document template serialization", () => {
  document.body.replaceChildren()
  const template = document.createElement("smoke-template")
  template.setAttribute("role", "document")
  template.innerHTML = "<p>Template content</p>"
  document.body.append(template)
  editor.doc.syncFromDOM()
  const parsed = new DOMParser().parseFromString(editor.toHTML(), "text/html")
  assert(parsed.body.firstElementChild?.localName === "smoke-template", "document template root was not serialized")
  assert(parsed.body.firstElementChild?.getAttribute("role") === "document", "document template role was lost")
  assert(parsed.body.textContent?.includes("Template content"), "template contents were lost")
})

await check("package migrations run in an opaque sandbox", async () => {
  const run = editor.features.migration.runner
  const source = `document.addEventListener("migrate", event => {
    let isolated = "no"
    try { parent.document.body } catch { isolated = "yes" }
    event.target.setAttribute("version", event.detail.version)
    event.target.setAttribute("isolated", isolated)
  })`
  const results = await run({packageName: "@smoke/quiz", version: "2.0.0", source, tagNames: ["smoke-quiz"],
    items: ['<smoke-quiz answer="1"></smoke-quiz>', "<smoke-quiz></smoke-quiz>"]}, 5000)
  assert(JSON.stringify(results) === JSON.stringify([
    '<smoke-quiz answer="1" version="2.0.0" isolated="yes"></smoke-quiz>',
    '<smoke-quiz version="2.0.0" isolated="yes"></smoke-quiz>',
  ]), `unexpected migration results: ${JSON.stringify(results)}`)
  const failure = await run({packageName: "@smoke/quiz", version: "2.0.0", source: "throw new Error('broken')", tagNames: ["smoke-quiz"], items: []}, 5000)
    .then(() => "resolved", error => String(error))
  assert(failure.includes("broken"), `a failing migration was not reported: ${failure}`)
  const stalled = await run({packageName: "@smoke/quiz", version: "2.0.0", source: "await new Promise(() => {})", tagNames: ["smoke-quiz"], items: []}, 300)
    .then(() => "resolved", error => String(error))
  assert(stalled.includes("timed out"), `a stalled migration did not time out: ${stalled}`)
  assert(!editor.appendix.querySelector("iframe"), "migration frames were not removed")
})

await check("package tests run in a separate frame", async () => {
  const result = await editor.features.dependency.runPackageTest(new URL("./package-test-fixture.js", location.href).href, undefined, 5000)
  assert(result.status === "failed", `unexpected test status: ${JSON.stringify(result)}`)
  assert(result.tests.map(test => test.passed).join() === "true,false", `unexpected test cases: ${JSON.stringify(result.tests)}`)
  assert(!editor.appendix.querySelector("iframe"), "the test frame was not removed")
  const missing = await editor.features.dependency.runPackageTest(new URL("./missing-test-fixture.js", location.href).href, undefined, 5000)
  assert(missing.status === "error", `a missing test module was not reported: ${JSON.stringify(missing)}`)
})

await check("native widget grouping dialog and processing instruction roundtrip", async () => {
  const [{WidgetGroupingDialog}, {defaultGroupingRules}, {writeWidgetGrouping, readWidgetGrouping}] = await Promise.all([
    import("../src/components/widget-grouping-dialog"), import("../src/widget-grouping.js"), import("../src/widget-grouping-dom"),
  ])
  const rules = {...defaultGroupingRules("browser"), method: "manual" as const,
    manualGroups: [{id: "manual", name: "Partners", members: ["ada"]}]}
  const dialog = new WidgetGroupingDialog()
  editor.appendix.append(dialog)
  try {
    const decision = dialog.show(rules, async () => ({canManage: true,
      participants: [{id: "ada", firstName: "Ada"}, {id: "lin", firstName: "Lin"}], groups: [], groupings: []}))
    await new Promise(requestAnimationFrame)
    await dialog.updateComplete
    assert(dialog.shadowRoot!.querySelector("dialog")!.open, "native grouping dialog did not open")
    const members = dialog.shadowRoot!.querySelector<HTMLSelectElement>("select[multiple]")!
    assert(members.selectedOptions.length === 1 && members.selectedOptions[0].value === "ada", "saved manual members were not preset")
    dialog.shadowRoot!.querySelector<HTMLButtonElement>("button.primary")!.click()
    const saved = await decision
    assert(saved?.manualGroups[0].members[0] === "ada", "native form submission did not save grouping")
    editor.schema.extendWidgets([{tagName: "smoke-sharing", editingConfig: {sharedData: true}}])
    const widget = document.createElement("smoke-sharing")
    document.body.append(widget)
    writeWidgetGrouping(widget, saved!)
    assert(widget.lastChild!.nodeType === Node.PROCESSING_INSTRUCTION_NODE, "grouping is not a native processing instruction")
    const exported = editor.toHTML(true)
    assert(exported.includes("<?ww-grouping "), "native instruction was lost from HTML export")
    const imported = editor.parseHTMLFragment(exported).fragment.querySelector("smoke-sharing")!
    assert(readWidgetGrouping(imported)?.manualGroups[0].name === "Partners", "grouping was not hydrated on HTML import")
  }
  finally { dialog.remove() }
})

await check("typing after deleting the initial paragraph stays in a paragraph", async () => {
  for(const mode of ["keyboard", "native", "body-text"]) {
    document.body.innerHTML = "<p></p>"
    const selection = document.getSelection()!
    if(mode === "native") {
      selection.setBaseAndExtent(document.body, 0, document.body, 1)
      assert(document.execCommand("delete"), "native deletion failed")
    }
    else {
      selection.setPosition(document.body.firstElementChild!, 0)
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true, cancelable: true}))
    }
    await new Promise(requestAnimationFrame)
    if(mode === "body-text") {
      const text = document.createTextNode("")
      document.body.prepend(text)
      selection.setPosition(text, 0)
    }
    assert(document.execCommand("insertText", false, "typed"), "native text insertion failed")
    assert(!Array.from(document.body.childNodes).some(node => node instanceof Text && node.data.trim()), `typing escaped the paragraph (${mode}): ${editor.toHTML(true)}`)
    assert(document.body.firstElementChild?.textContent === "typed", "typed content was lost")
    assert(document.body.firstElementChild!.contains(selection.anchorNode), "caret escaped the typed paragraph")
    assert(selection.anchorOffset === 5, "text repair moved the caret")
  }
})

editor.destroy()
const failed = checks.filter(item => item.error)
document.documentElement.dataset.nativeSmokeStatus = failed.length ? "failed" : "passed"
if(new URLSearchParams(location.search).has("run")) {
  await fetch("/__native-result", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({checks}),
  })
}
