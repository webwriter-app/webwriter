import {test} from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {build} from "esbuild"
import {sandboxBootstrapSource, sandboxScriptHash, sandboxDocument, renderSandbox} from "../sandbox.js"

test("the built authorization hashes the exact bootstrap, including after minification", async () => {
  const hash = text => `sha256-${createHash("sha256").update(text).digest("base64")}`
  assert.equal(sandboxScriptHash, hash(sandboxBootstrapSource))
  const output = await build({entryPoints: [new URL("../sandbox.js", import.meta.url).pathname], bundle: true, minify: true, format: "esm", write: false})
  const minified = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`)
  assert.equal(minified.sandboxBootstrapSource, sandboxBootstrapSource)
  assert.equal(minified.sandboxScriptHash, hash(minified.sandboxBootstrapSource))
})

test("HTML is inert escaped data, separate from the fixed executable bootstrap", () => {
  const html = '<!--keep--><svg><title>Ä</title></svg><script>document.body.append("JS works")</script></ScRiPt><script nonce="forged">bad()</script>'
  const output = sandboxDocument(html)
  assert.equal((output.match(/<script\b/g) || []).length, 2)
  const payload = output.match(/<script type="application\/json">([^]*?)<\/script>/)[1]
  assert.equal(JSON.parse(payload), html)
  assert.equal(payload.includes("<"), false)
  assert.ok(output.endsWith(`<script>${sandboxBootstrapSource}</script></body></html>`))
  assert.equal(output.includes('nonce="forged"'), false)
})

test("navigation receives only script sandbox permissions before assigning srcdoc", () => {
  const attributes = new Map([["sandbox", "allow-scripts allow-same-origin allow-popups"], ["src", "https://example.com"]])
  let navigations = 0
  const frame = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    set srcdoc(value) {
      assert.equal(attributes.get("sandbox"), "allow-scripts")
      assert.equal(attributes.has("src"), false)
      assert.equal(value, sandboxDocument(navigations ? "Second" : "First"))
      navigations++
    },
  }
  renderSandbox(frame, "First")
  renderSandbox(frame, "Second")
  assert.equal(navigations, 2)
})
