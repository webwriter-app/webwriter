import type {LocalPackageWorkerRequest} from "./local-package-worker-protocol"
import type {LocalPackageDirectoryHandle} from "./local-package-worker"
import {
  readLocalPackageDirectories,
  removeLocalPackageDirectory,
  saveLocalPackageDirectory,
} from "./local-package-storage"

const DEFAULT_TIMEOUT_MS = 5000

export {isStoredLocalPackageDirectory, type StoredLocalPackageDirectory} from "./local-package-storage"

/**
 * Restored File System Access handles commonly return `prompt` after a page
 * reload. Checking first avoids an unnecessary prompt when the browser kept
 * the grant; requesting afterwards lets Chromium restore persisted access.
 */
export async function requestLocalPackageDirectoryPermission(handle: LocalPackageDirectoryHandle) {
  if(typeof handle.queryPermission !== "function" || typeof handle.requestPermission !== "function") return true
  const descriptor = {mode: "readwrite"} as const
  if(await handle.queryPermission(descriptor) === "granted") return true
  return await handle.requestPermission(descriptor) === "granted"
}

export type LocalPackageWorkerClientOptions = {
  scriptUrl?: string
  scope?: string
  timeoutMs?: number
}

function supportsWorker() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator
}

function defaultWorkerUrl() {
  const base = new URL(import.meta.env.BASE_URL || "/", globalThis.location?.href || "http://localhost/")
  return new URL("local-package-service-worker.js", base).href
}

function defaultWorkerScope() {
  return new URL(import.meta.env.BASE_URL || "/", globalThis.location?.href || "http://localhost/").pathname
}

async function waitForActiveWorker(registration: ServiceWorkerRegistration, timeoutMs: number) {
  if(registration.active) return registration
  const worker = registration.installing ?? registration.waiting
  if(!worker) throw new Error("The local package service worker did not install")
  if(worker.state === "activated") return registration
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.removeEventListener("statechange", onStateChange)
      reject(new Error("The local package service worker did not activate"))
    }, timeoutMs)
    const onStateChange = () => {
      if(worker.state === "activated") {
        clearTimeout(timer)
        worker.removeEventListener("statechange", onStateChange)
        resolve()
      }
      else if(worker.state === "redundant") {
        clearTimeout(timer)
        worker.removeEventListener("statechange", onStateChange)
        reject(new Error("The local package service worker installation failed"))
      }
    }
    worker.addEventListener("statechange", onStateChange)
  })
  return registration
}

/** Registers and synchronizes local directory handles with the root-scope worker. */
export class LocalPackageWorkerClient {
  private readonly scriptUrl: string
  private readonly scope: string
  private readonly timeoutMs: number
  private registrationPromise: Promise<ServiceWorkerRegistration> | null = null
  private requestSequence = 0

  constructor(options: LocalPackageWorkerClientOptions = {}) {
    this.scriptUrl = options.scriptUrl ?? defaultWorkerUrl()
    this.scope = options.scope ?? defaultWorkerScope()
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** Installs the worker and restores handles previously stored in IndexedDB. */
  async start() {
    if(!supportsWorker()) throw new Error("This browser does not support service workers for local packages")
    const registration = await this.registration()
    const persisted = await this.storedDirectories()
    await Promise.all(persisted.map(async record => {
      try { await this.send({type: "register-local-package", id: record.id, handle: record.handle}) }
      catch { /* A revoked handle is reported when the package is opened again. */ }
    }))
    return registration
  }

  /**
   * Returns validated directory handles saved by this client. Malformed
   * records, revoked database entries, and unavailable IndexedDB are omitted
   * so callers can still offer a fresh picker flow.
   */
  async storedDirectories() {
    return await readLocalPackageDirectories()
  }

  async register(id: string, handle: LocalPackageDirectoryHandle) {
    if(!id) throw new TypeError("A local package id is required")
    // Save the picker result before worker setup. Besides making IndexedDB the
    // durable source of truth, this preserves the handle when worker startup
    // fails or the page is reloaded while registration is in progress.
    await saveLocalPackageDirectory({id, handle})
    await this.registration()
    await this.send({type: "register-local-package", id, handle})
  }

  async unregister(id: string) {
    await this.registration()
    await this.send({type: "unregister-local-package", id})
    await removeLocalPackageDirectory(id)
  }

  async clear() {
    await this.registration()
    await this.send({type: "clear-local-packages"})
    const persisted = await this.storedDirectories()
    await Promise.all(persisted.map(record => removeLocalPackageDirectory(record.id)))
  }

  private registration() {
    if(!this.registrationPromise) {
      this.registrationPromise = (async() => {
        const registration = await navigator.serviceWorker.register(this.scriptUrl, {
          scope: this.scope,
          type: "module",
        })
        // Wait on this registration specifically. `navigator.serviceWorker.ready`
        // could resolve to an unrelated worker which controls the same page.
        return await waitForActiveWorker(registration, this.timeoutMs)
      })()
      this.registrationPromise.catch(() => { this.registrationPromise = null })
    }
    return this.registrationPromise
  }

  private async send(message: LocalPackageWorkerRequest) {
    const registration = await this.registration()
    const worker = registration.active ?? registration.waiting ?? registration.installing
    if(!worker) throw new Error("The local package service worker is not active")

    const requestId = `local-package-${++this.requestSequence}`
    const channel = new MessageChannel()
    const response = new Promise<{ok: boolean, error?: string}>((resolve, reject) => {
      const timer = setTimeout(() => {
        channel.port1.close()
        reject(new Error("The local package service worker did not respond"))
      }, this.timeoutMs)
      channel.port1.onmessage = event => {
        clearTimeout(timer)
        channel.port1.close()
        const value = event.data as {type?: unknown, requestId?: unknown, ok?: unknown, error?: unknown}
        if(value.type !== "local-package-worker-ack" || value.requestId !== requestId) {
          reject(new Error("Invalid local package service worker response"))
          return
        }
        resolve({ok: value.ok === true, ...(typeof value.error === "string" ? {error: value.error} : {})})
      }
      channel.port1.start?.()
      try {
        worker.postMessage({
          ...message,
          type: message.type,
          requestId,
        }, [channel.port2])
      }
      catch(error) {
        clearTimeout(timer)
        channel.port1.close()
        reject(error)
      }
    })
    const result = await response
    if(!result.ok) throw new Error(result.error || "The local package service worker rejected the request")
  }
}
