import type {LocalPackageDirectory} from "./local-package"

export type GitPackageSource = {repository: string, ref: string, path: string}
function validSource(value: unknown): value is GitPackageSource {
  if(!value || typeof value !== "object") return false
  const source = value as Partial<GitPackageSource>
  if(typeof source.repository !== "string" || typeof source.ref !== "string" || typeof source.path !== "string") return false
  try {
    const url = new URL(source.repository)
    return ["http:", "https:", "git:"].includes(url.protocol) && !url.username && !url.password
  }
  catch {return false}
}

export type GitPackageSnapshot = {id: string, source: GitPackageSource, commit: string, baseUrl: string}

export async function fetchGitPackageSource(source: GitPackageSource, apiUrl: string): Promise<GitPackageSnapshot> {
  const response = await fetch(apiUrl, {method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify(source), cache: "no-store", credentials: "omit"})
  let value
  try {value = await response.json()}
  catch {throw new Error("Could not load the Git package. Check that the development backend supports Git packages.")}
  if(!response.ok) throw new Error(value?.error?.message ?? "Could not fetch the Git package")
  if(!value || typeof value.id !== "string" || typeof value.commit !== "string" || typeof value.baseUrl !== "string" || !validSource(value.source)) throw new Error("Invalid Git package response")
  const base = new URL(value.baseUrl)
  if(base.origin !== new URL(apiUrl, location.href).origin || !base.pathname.startsWith("/api/developer-packages/git/")) throw new Error("Invalid Git package resource URL")
  return value as GitPackageSnapshot
}

export function gitPackageUrl(snapshot: Pick<GitPackageSnapshot, "baseUrl">, path: string) {
  const parts = path.replace(/^\.\//, "").split("/")
  if(parts.some(part => !part || part === "." || part === ".." || /[\\\x00]/.test(part))) throw new Error("Invalid Git package path")
  return snapshot.baseUrl + parts.map(encodeURIComponent).join("/")
}

/** Read-only, uncached directory adapter shared by manifest and README loading. */
export function gitPackageDirectory(snapshot: Pick<GitPackageSnapshot, "baseUrl">, prefix = ""): LocalPackageDirectory {
  return {
    async getFileHandle(name) {
      const url = gitPackageUrl(snapshot, prefix + name)
      return {async getFile() {
        const response = await fetch(url, {cache: "no-store", credentials: "omit"})
        if(response.status === 404) throw new DOMException(`Missing ${name}`, "NotFoundError")
        if(!response.ok) throw new Error(`Could not read Git package file (${response.status})`)
        return response.blob()
      }}
    },
    async getDirectoryHandle(name) {
      gitPackageUrl(snapshot, prefix + name)
      return gitPackageDirectory(snapshot, prefix + name + "/")
    },
  }
}

export type StoredGitPackageSource = {id: string, source: GitPackageSource}
const storageKey = "webwriter-developer-git-packages"

export function readGitPackageSources(): StoredGitPackageSource[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(value) ? value.filter((entry): entry is StoredGitPackageSource => entry && typeof entry.id === "string"
      && validSource(entry.source)) : []
  }
  catch {return []}
}

export function saveGitPackageSources(sources: StoredGitPackageSource[]) {
  // Persist descriptors only: never manifests, file bytes or resolved resource URLs.
  try {localStorage.setItem(storageKey, JSON.stringify(sources.map(({id, source}) => ({id, source}))))}
  catch { /* Packages remain usable when browser storage is unavailable. */ }
}
