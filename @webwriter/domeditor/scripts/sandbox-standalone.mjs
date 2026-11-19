// A real file:// export, with no server or network dependencies. The widget
// fixture is bundled/minified exactly as a consuming widget would be.
import {build} from "esbuild"
import {spawn} from "node:child_process"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import {sandboxBootstrapSource, sandboxDocument, sandboxScriptHash} from "../../widget/sandbox.js"

const root = fileURLToPath(new URL("..", import.meta.url))
const websiteFile = process.argv.find(argument => argument.startsWith("--website="))?.slice("--website=".length)
const scratch = await mkdtemp(join(tmpdir(), "webwriter-sandbox-export-"))
try {
  const run = html => {
    const results = {isolated: false, ordered: false, fresh: false, guarded: true};
    const output = document.getElementById("result");
    const write = () => { output.textContent = JSON.stringify(results); };
    const widget = document.createElement("ww-exported-widget");
    const shadow = widget.attachShadow({mode: "open"});
    const frame = document.createElement("iframe");
    frame.title = "Standalone HTML activity";
    shadow.append(frame);
    document.body.append(widget);
    addEventListener("message", event => {
      if(event.source === frame.contentWindow && event.data?.kind === "ran") {
        results.isolated = event.origin === "null" && event.data.isolated === true;
        results.ordered = event.data.order === "classic,external,module" && event.data.kept === true;
        renderSandbox(frame, '<script>if(typeof sandboxOrder === "undefined") parent.postMessage({kind:"fresh"}, "*")</script>');
      }
      else if(event.source === frame.contentWindow && event.data?.kind === "fresh") results.fresh = true;
      else if(event.data?.kind === "unguarded") results.guarded = false;
      write();
    });
    renderSandbox(frame, html);
    write();
  };
  const external = `data:text/javascript,${encodeURIComponent('globalThis.sandboxOrder.push("external")')}`
  const activity = `<body><!--keep--><svg><path/></svg><custom-item data-kept="yes"></custom-item>
<script type="application/json" id="data">{"kept":true}</script>
<script>globalThis.sandboxOrder = ["classic"];</script><script src="${external}"></script>
<script type="module">globalThis.sandboxOrder.push("module")</script>
<script>let isolated = false; try { parent.document.body } catch { isolated = true }
parent.postMessage({kind:"ran", isolated, order:sandboxOrder.join(","), kept:JSON.parse(document.getElementById("data").textContent).kept
&& document.querySelector("path").namespaceURI === "http://www.w3.org/2000/svg" && document.querySelector("custom-item").dataset.kept === "yes"}, "*")</script>`
  const fixture = `import {renderSandbox} from ${JSON.stringify(fileURLToPath(new URL("../../widget/sandbox.js", import.meta.url)))};
(${run.toString()})(${JSON.stringify(activity)});`
  const bundle = await build({stdin: {contents: fixture, resolveDir: root}, bundle: true, minify: true, format: "iife", write: false})
  const escaped = bundle.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")
  const attack = `<script>parent.postMessage({kind:"unguarded"}, "*")</script>`
  const attribute = text => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
  const unguarded = sandboxDocument(attack)
  const topLevelPayload = JSON.stringify(attack).replaceAll("<", "\\u003c")
  const html = websiteFile ? await readFile(websiteFile, "utf8") : `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-fixture' 'strict-dynamic' '${sandboxScriptHash}'; style-src 'unsafe-inline'; frame-src blob: data:; base-uri 'none'; object-src 'none'">
<title>Standalone sandbox export</title></head><body><pre id="result">pending</pre>
<iframe title="Unsandboxed runner must refuse" srcdoc="${attribute(unguarded)}"></iframe>
<iframe title="Same-origin sandbox must refuse" sandbox="allow-scripts allow-same-origin" srcdoc="${attribute(unguarded)}"></iframe>
<iframe title="Modified bootstrap must be blocked" sandbox="allow-scripts" srcdoc="${attribute(unguarded.replace(sandboxBootstrapSource, sandboxBootstrapSource + '\n/* changed */'))}"></iframe>
<script type="application/json">${topLevelPayload}</script><script>${sandboxBootstrapSource}</script>
<script nonce="fixture">${escaped}</script></body></html>`
  const filename = join(scratch, "export.html")
  await writeFile(filename, html)
  // The output is entirely self-contained; no localhost process is started.
  const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--enable-logging=stderr", `--user-data-dir=${join(scratch, "profile")}`,
    "--remote-debugging-pipe"], {stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"]})
  let stderr = "", protocolBuffer = "", sequence = 0
  const pending = new Map()
  // CDP travels over inherited pipes: this test starts no listening server.
  browser.stdio[4].on("data", chunk => {
    protocolBuffer += chunk.toString()
    let end
    while((end = protocolBuffer.indexOf("\0")) >= 0) {
      const response = JSON.parse(protocolBuffer.slice(0, end))
      protocolBuffer = protocolBuffer.slice(end + 1)
      const request = pending.get(response.id)
      if(!request) continue
      pending.delete(response.id)
      clearTimeout(request.timer)
      if(response.error) request.reject(new Error(JSON.stringify(response.error)))
      else request.resolve(response.result)
    }
  })
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome timed out: ${method}`)) }, 10000)
    pending.set(id, {resolve, reject, timer})
    browser.stdio[3].write(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}) + "\0")
  })
  browser.on("error", error => {
    for(const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
    pending.clear()
  })
  browser.stderr.on("data", chunk => { stderr += chunk })
  const exited = new Promise(resolve => browser.on("exit", resolve))
  try {
    const {targetId} = await command("Target.createTarget", {url: "about:blank"})
    const {sessionId} = await command("Target.attachToTarget", {targetId, flatten: true})
    await command("Page.enable", {}, sessionId)
    if(websiteFile) {
      await command("Network.enable", {}, sessionId)
      await command("Network.setBlockedURLs", {urls: ["http://*", "https://*"]}, sessionId)
      await command("Page.addScriptToEvaluateOnNewDocument", {source: `addEventListener("message", event => {
        if(event.data?.kind === "webwriter-local-website") window.__websiteExport = JSON.stringify({
          isolated: event.origin === "null" && event.data.isolated === true,
          text: event.data.text.includes("Local lesson") && event.data.text.includes("JS works")
        });
      });`}, sessionId)
    }
    await command("Page.navigate", {url: pathToFileURL(filename).href}, sessionId)
    const expression = websiteFile ? "window.__websiteExport" : 'document.getElementById("result")?.textContent'
    const read = async () => (await command("Runtime.evaluate", {expression, returnByValue: true}, sessionId)).result.value
    const expected = websiteFile ? '{"isolated":true,"text":true}' : '{"isolated":true,"ordered":true,"fresh":true,"guarded":true}'
    let result
    for(let attempt = 0; attempt < 200; attempt++) {
      result = await read()
      if(result === expected) break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    // Give negative fixtures time to report an unexpected activation too.
    await new Promise(resolve => setTimeout(resolve, 200))
    result = await read()
    if(process.env.WEBWRITER_SANDBOX_SCREENSHOT) {
      const {data} = await command("Page.captureScreenshot", {format: "png"}, sessionId)
      await writeFile(process.env.WEBWRITER_SANDBOX_SCREENSHOT, Buffer.from(data, "base64"))
    }
    if(result !== expected) {
      throw new Error(`Standalone sandbox failed: ${result ?? "no result"}\n${stderr.split("\n").filter(line => /CONSOLE|Content.Security|Uncaught/.test(line)).join("\n")}`)
    }
    console.log(`Standalone file:// ${websiteFile ? "Website export" : "sandbox"} passed: ${result}`)
  }
  finally {
    for(const request of pending.values()) clearTimeout(request.timer)
    browser.kill()
    await exited
  }
}
finally { await rm(scratch, {recursive: true, force: true}) }
