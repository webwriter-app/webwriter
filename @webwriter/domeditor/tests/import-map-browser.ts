import {resolvePackageDependencies, packageImportMapScript} from "../src/package-dependencies"
import {bundleOfflineModules} from "../src/offline-module-bundler"
import type {WebWriterPackage} from "../src/packages"

type Check = {name: string, error?: string}
const checks: Check[] = []
const check = async (name: string, run: () => Promise<void>) => {
  try { await run(); checks.push({name}) }
  catch(error) { checks.push({name, error: String(error)}) }
}
const root = new URL("/tests/import-map-fixture/", location.origin)
const entries = [new URL("a.js", root).href, new URL("b.js", root).href]
const sharedUrl = new URL("shared.js", root).href
const packages: WebWriterPackage[] = entries.map((entry, index) => ({
  name: `@webwriter/import-map-fixture-${index}`, version: "1.0.0", label: `Fixture ${index}`,
  authors: [], keywords: [], links: {}, members: [], scripts: [entry], styles: [],
  manifest: {name: `@webwriter/import-map-fixture-${index}`, version: "1.0.0"},
}))
let map: Awaited<ReturnType<typeof resolvePackageDependencies>>["map"]

await check("JSPM links two local ESM entries to one shared dependency", async () => {
  const plan = await resolvePackageDependencies(packages, location.href, {
    imports: {"webwriter-shared-fixture": sharedUrl},
  })
  map = plan.map
  if(plan.entries.length !== 2 || plan.map?.imports?.["webwriter-shared-fixture"] !== sharedUrl) {
    throw new Error(`Unexpected import map: ${JSON.stringify(plan)}`)
  }
})

await check("native import map loads the shared module once", async () => {
  if(!map) throw new Error("JSPM did not provide a map")
  document.head.append(packageImportMapScript(document, map))
  const [first, second] = await Promise.all(entries.map(url => import(/* @vite-ignore */ url)))
  if(first.a !== second.b || (globalThis as typeof globalThis & {webwriterSharedEvaluations?: number}).webwriterSharedEvaluations !== 1) {
    throw new Error("The two entries did not share one module instance")
  }
})

await check("nonce CSP permits the editor's import map and module graph", async () => {
  if(!map) throw new Error("JSPM did not provide a map")
  const nonce = crypto.randomUUID()
  const frame = document.createElement("iframe")
  frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; connect-src *"><p>Package frame</p>`
  document.body.append(frame)
  try {
    await new Promise<void>((resolve, reject) => {
      frame.addEventListener("load", () => resolve(), {once: true})
      frame.addEventListener("error", () => reject(new Error("Fixture iframe failed to load")), {once: true})
    })
    const doc = frame.contentDocument!
    const importMap = packageImportMapScript(doc, map)
    importMap.nonce = nonce
    doc.head.append(importMap)
    await Promise.all(entries.map(url => new Promise<void>((resolve, reject) => {
      const script = doc.createElement("script")
      script.type = "module"
      script.nonce = nonce
      script.src = url
      script.addEventListener("load", () => resolve(), {once: true})
      script.addEventListener("error", () => reject(new Error(`Module blocked by CSP: ${url}`)), {once: true})
      doc.head.append(script)
    })))
    if((frame.contentWindow as Window & {webwriterSharedEvaluations?: number}).webwriterSharedEvaluations !== 1) {
      throw new Error("The CSP frame did not share the module")
    }
  }
  finally { frame.remove() }
})

await check("esbuild-wasm bundles the resolved graph for offline execution", async () => {
  if(!map) throw new Error("JSPM did not provide a map")
  const {js} = await bundleOfflineModules(entries, map, location.href)
  if(/\bimport\s*(?:\(|["'{*])/.test(js)) throw new Error("Bundle retained an import")
  await import(/* @vite-ignore */ `data:text/javascript;base64,${btoa(js)}`)
  if((globalThis as typeof globalThis & {webwriterSharedEvaluations?: number}).webwriterSharedEvaluations !== 2) {
    throw new Error("The offline bundle did not execute its shared module once")
  }
})

await check("offline bundling runs under the editor frame CSP", async () => {
  if(!map) throw new Error("JSPM did not provide a map")
  const nonce = crypto.randomUUID()
  const frame = document.createElement("iframe")
  frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'; connect-src * data: blob:; worker-src blob: https:; style-src 'none'">`
  const loaded = new Promise<void>((resolve, reject) => {
    frame.addEventListener("load", () => resolve(), {once: true})
    frame.addEventListener("error", () => reject(new Error("Offline fixture iframe failed to load")), {once: true})
  })
  document.body.append(frame)
  try {
    await loaded
    await new Promise<void>((resolve, reject) => {
      const diagnostics: string[] = []
      frame.contentDocument!.addEventListener("securitypolicyviolation", event => {
        diagnostics.push(`CSP ${event.violatedDirective}: ${event.blockedURI}`)
      })
      frame.contentWindow!.addEventListener("error", event => { diagnostics.push(`Script: ${event.message} ${event.error?.stack ?? ""}`) })
      frame.contentWindow!.addEventListener("unhandledrejection", event => { diagnostics.push(`Promise: ${String(event.reason)}`) })
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Offline bundle timed out under CSP: ${diagnostics.join("; ")}`)) }, 20_000)
      const onMessage = (event: MessageEvent) => {
        if(event.source !== frame.contentWindow || event.data?.type !== "offline-csp-result") return
        cleanup()
        if(event.data.success) resolve()
        else reject(new Error(String(event.data.error)))
      }
      const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", onMessage) }
      window.addEventListener("message", onMessage)
      const script = frame.contentDocument!.createElement("script")
      script.type = "module"
      script.nonce = nonce
      script.addEventListener("error", () => { cleanup(); reject(new Error(`Offline module script failed: ${diagnostics.join("; ")}`)) }, {once: true})
      script.textContent = `
        import {bundleOfflineModules} from "/src/offline-module-bundler.ts";
        try {
          const result = await bundleOfflineModules(${JSON.stringify(entries)}, ${JSON.stringify(map)}, parent.location.href);
          parent.postMessage({type: "offline-csp-result", success: !!result.js}, "*");
        }
        catch(error) { parent.postMessage({type: "offline-csp-result", success: false, error: String(error)}, "*"); }
      `
      frame.contentDocument!.head.append(script)
    })
  }
  finally { frame.remove() }
})

const failed = checks.filter(item => item.error)
document.querySelector("#status")!.textContent = `${checks.length - failed.length} passed, ${failed.length} failed`
document.querySelector("#report")!.textContent = JSON.stringify(checks, null, 2)
if(new URLSearchParams(location.search).has("run")) {
  await fetch("/__native-result", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({checks})})
}
