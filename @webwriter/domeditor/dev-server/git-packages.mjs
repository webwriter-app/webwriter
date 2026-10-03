import {spawn} from "node:child_process"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, extname} from "node:path"

const maximumSnapshotBytes = 64 * 1024 * 1024
const maximumFiles = 10_000
const invalid = message => Object.assign(new Error(message), {status: 400})

export function gitPackageSource(value) {
  if(!value || typeof value.repository !== "string") throw invalid("A public Git repository URL is required")
  let repository
  try { repository = new URL(value.repository.trim()) }
  catch { throw invalid("Enter a public Git repository URL") }
  if(!["https:", "http:", "git:"].includes(repository.protocol) || repository.username || repository.password
    || repository.search || repository.hash) throw invalid("Use an anonymous HTTP, HTTPS or git:// repository URL")
  const ref = typeof value.ref === "string" ? value.ref.trim() : ""
  // A ref is passed as one argument, never as a shell command or refspec destination.
  if(ref && (ref.startsWith("-") || /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(ref)
    || ref.includes("..") || ref.includes("@{") || ref.includes("//") || ref.endsWith("/") || ref.endsWith(".")
    || ref.split("/").some(part => part.startsWith(".") || part.endsWith(".lock")))) throw invalid("Enter a valid branch or tag")
  const path = typeof value.path === "string" ? value.path.trim().replace(/^\.\//, "").replace(/\/$/, "") : ""
  if(path && path.split("/").some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f\x7f]/.test(part))) {
    throw invalid("The package folder must be a relative path inside the repository")
  }
  return {repository: repository.href, ref, path}
}

function runGit(args, {cwd, input = ""} = {}) {
  return new Promise((resolve, reject) => {
    // Ignore user Git configuration, hooks, credential helpers and interactive prompts.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")))
    Object.assign(env, {GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/usr/bin/false"})
    const child = spawn("git", ["-c", "credential.helper=", "-c", "core.hooksPath=/dev/null",
      "-c", "protocol.allow=never", "-c", "protocol.http.allow=always", "-c", "protocol.https.allow=always",
      "-c", "protocol.git.allow=always", "-c", "http.followRedirects=initial", ...args], {cwd, env, stdio: "pipe"})
    const chunks = []
    let size = 0
    let stderr = ""
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000)
    child.stdout.on("data", chunk => {
      size += chunk.length
      if(size > maximumSnapshotBytes + 2 * 1024 * 1024) child.kill("SIGKILL")
      else chunks.push(chunk)
    })
    child.stderr.on("data", chunk => {stderr = (stderr + chunk.toString()).slice(-8_192)})
    child.on("error", error => {clearTimeout(timer); reject(error)})
    child.on("close", code => {
      clearTimeout(timer)
      if(code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(size > maximumSnapshotBytes ? "Git package exceeds the 64 MiB limit"
        : `Could not fetch the public Git package. ${stderr.trim() || "Git operation timed out"}`))
    })
    child.stdin.on("error", () => {})
    child.stdin.end(input)
  })
}

/** No checkout or persistent package cache. The temporary bare transfer is
 * removed even on failure; only immutable file bytes remain in server memory. */
export async function fetchGitPackage(value, {git = runGit, temporaryDirectory = tmpdir()} = {}) {
  const source = gitPackageSource(value)
  const directory = await mkdtemp(join(temporaryDirectory, "webwriter-git-"))
  try {
    await git(["init", "--bare", "--template=", directory])
    await git(["fetch", "--depth=1", "--no-tags", "--no-recurse-submodules", "--", source.repository, source.ref || "HEAD"], {cwd: directory})
    const commit = (await git(["rev-parse", "FETCH_HEAD^{commit}"], {cwd: directory})).toString().trim()
    const tree = (await git(["ls-tree", "-rz", "--full-tree", commit], {cwd: directory})).toString()
    const prefix = source.path ? source.path + "/" : ""
    const entries = tree.split("\0").filter(Boolean).flatMap(entry => {
      const match = /^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(entry)
      if(!match || !match[3].startsWith(prefix)) return []
      return [{hash: match[2], path: match[3].slice(prefix.length)}]
    })
    if(entries.length > maximumFiles) throw new Error("Git package exceeds the 10,000 file limit")
    if(!entries.some(entry => entry.path === "package.json")) throw new Error("No package.json found at the selected Git ref and package folder")
    const objects = await git(["cat-file", "--batch"], {cwd: directory, input: entries.map(entry => entry.hash).join("\n") + "\n"})
    const files = new Map()
    let offset = 0
    let total = 0
    for(const entry of entries) {
      const end = objects.indexOf(10, offset)
      const header = objects.subarray(offset, end).toString()
      const match = /^([a-f0-9]+) blob (\d+)$/.exec(header)
      if(end < 0 || !match || match[1] !== entry.hash) throw new Error("Invalid Git blob response")
      const size = Number(match[2])
      total += size
      offset = end + 1
      if(total > maximumSnapshotBytes || offset + size >= objects.length || objects[offset + size] !== 10) throw new Error("Git package exceeds the 64 MiB limit or contains an incomplete blob")
      files.set(entry.path, Buffer.from(objects.subarray(offset, offset + size)))
      offset += size + 1
    }
    return {source, commit, files}
  }
  finally {await rm(directory, {recursive: true, force: true})}
}

export function gitPackageMimeType(path) {
  return ({".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css",
    ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".wasm": "application/wasm",
    ".txt": "text/plain", ".md": "text/plain"})[extname(path).toLowerCase()] ?? "application/octet-stream"
}
