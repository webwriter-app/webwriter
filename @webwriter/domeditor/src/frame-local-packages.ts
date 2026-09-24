import type {IImportMap} from "@jspm/import-map"
import type {WebWriterPackage} from "./packages"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "./local-package-worker"

/** Only local package resources change origin when copied into a frame. */
export function frameLocalPackageURL(value: string, appOrigin: string, frameOrigin: string) {
  let url: URL
  try { url = new URL(value, appOrigin) }
  catch { return value }
  if(url.origin !== appOrigin || !url.pathname.startsWith(LOCAL_PACKAGE_ROUTE_PREFIX)) return value
  url.host = new URL(frameOrigin).host
  url.protocol = new URL(frameOrigin).protocol
  return url.href
}

export function framePackages(packages: WebWriterPackage[], appOrigin: string, frameOrigin: string) {
  const rewrite = (value: string) => frameLocalPackageURL(value, appOrigin, frameOrigin)
  return packages.map(pkg => ({
    ...pkg,
    iconUrl: pkg.iconUrl && rewrite(pkg.iconUrl),
    scripts: pkg.scripts.map(rewrite),
    styles: pkg.styles.map(rewrite),
    ...(pkg.migrationUrl ? {migrationUrl: rewrite(pkg.migrationUrl)} : {}),
    ...(pkg.tests ? {tests: pkg.tests.map(test => ({
      ...test,
      scriptUrl: rewrite(test.scriptUrl),
      ...(test.styleUrl ? {styleUrl: rewrite(test.styleUrl)} : {}),
    }))} : {}),
    members: pkg.members.map(member => ({
      ...member,
      iconUrl: member.iconUrl && rewrite(member.iconUrl),
      htmlUrl: member.htmlUrl && rewrite(member.htmlUrl),
      scriptUrl: member.scriptUrl && rewrite(member.scriptUrl),
      styleUrl: member.styleUrl && rewrite(member.styleUrl),
    })),
  }))
}

export function frameImportMap(map: IImportMap | null | undefined, appOrigin: string, frameOrigin: string) {
  if(!map) return map
  const rewrite = (value: string) => frameLocalPackageURL(value, appOrigin, frameOrigin)
  return {
    ...map,
    ...(map.imports ? {imports: Object.fromEntries(Object.entries(map.imports).map(([key, value]) => [key, rewrite(value)]))} : {}),
    ...(map.scopes ? {scopes: Object.fromEntries(Object.entries(map.scopes).map(([scope, imports]) => [
      rewrite(scope), Object.fromEntries(Object.entries(imports).map(([key, value]) => [key, rewrite(value)])),
    ]))} : {}),
    ...(map.integrity ? {integrity: Object.fromEntries(Object.entries(map.integrity).map(([key, value]) => [rewrite(key), value]))} : {}),
  } satisfies IImportMap
}

/** A frame client relays only service-worker requests, using the same port. */
export function connectFrameLocalPackages(hostOrigin: string, nonce: string) {
  navigator.serviceWorker?.addEventListener("message", event => {
    if(event.data?.type !== "frame-local-package-request" || typeof event.data.url !== "string"
      || !event.ports[0]) return
    let url: URL
    try { url = new URL(event.data.url) }
    catch { return }
    if(url.origin !== location.origin || !url.pathname.startsWith(LOCAL_PACKAGE_ROUTE_PREFIX)) return
    window.parent.postMessage({type: "frame-local-package-request", bridgeNonce: nonce, url: url.href,
      method: event.data.method}, hostOrigin, [event.ports[0]])
  })
}
