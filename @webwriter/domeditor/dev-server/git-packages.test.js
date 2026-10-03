// @vitest-environment node
import {spawnSync} from "node:child_process"
import {mkdtemp, mkdir, writeFile, readdir, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {describe, expect, it, vi} from "vitest"
import {fetchGitPackage, gitPackageSource} from "./git-packages.mjs"

const run = (args, options = {}) => {
  const result = spawnSync("git", args, {cwd: options.cwd, input: options.input, maxBuffer: 8 * 1024 * 1024})
  if(result.status !== 0) throw new Error(result.stderr.toString())
  return result.stdout
}

describe("Git package fetch", () => {
  it("fetches branches and tags through Git, preserves binary assets, and removes transfer files", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "git-package-test-"))
    const repository = join(temporary, "repository")
    const transfers = join(temporary, "transfers")
    try {
      await mkdir(repository)
      await mkdir(transfers)
      run(["init", "--initial-branch=main", "--template=", repository])
      await mkdir(join(repository, "packages"))
      await mkdir(join(repository, "packages", "demo"))
      const folder = join(repository, "packages", "demo")
      await writeFile(join(folder, "package.json"), '{"name":"@git/demo","version":"1.0.0"}')
      await writeFile(join(folder, "asset.png"), Buffer.from([0, 255, 10, 128]))
      run(["add", "."], {cwd: repository})
      run(["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "First"], {cwd: repository})
      run(["-c", "user.name=Test", "-c", "user.email=test@example.test", "tag", "-a", "v1.0.0", "-m", "Release", "--", "HEAD"], {cwd: repository})
      await writeFile(join(folder, "package.json"), '{"name":"@git/demo","version":"2.0.0"}')
      run(["add", "."], {cwd: repository})
      run(["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "Second"], {cwd: repository})
      const git = vi.fn(async (args, options) => {
        const redirected = args.map(arg => arg === "https://example.test/demo.git" ? repository : arg)
        return run(redirected, options)
      })
      const source = {repository: "https://example.test/demo.git", path: "packages/demo"}
      const branch = await fetchGitPackage({...source, ref: "main"}, {git, temporaryDirectory: transfers})
      const tag = await fetchGitPackage({...source, ref: "v1.0.0"}, {git, temporaryDirectory: transfers})
      const head = await fetchGitPackage({...source, ref: ""}, {git, temporaryDirectory: transfers})
      expect(branch.files.get("package.json").toString()).toContain('"2.0.0"')
      expect(tag.files.get("package.json").toString()).toContain('"1.0.0"')
      expect(head.commit).toBe(branch.commit)
      expect(tag.commit).not.toBe(branch.commit)
      expect(tag.files.get("asset.png")).toEqual(Buffer.from([0, 255, 10, 128]))
      expect([...tag.files.keys()]).toEqual(["asset.png", "package.json"])
      expect(await readdir(transfers)).toEqual([])
      await expect(fetchGitPackage({...source, ref: "missing"}, {git, temporaryDirectory: transfers})).rejects.toThrow()
      expect(await readdir(transfers)).toEqual([])
    }
    finally {await rm(temporary, {recursive: true, force: true})}
  })

  it.each([
    {repository: "file:///secret"}, {repository: "ssh://git@example.test/demo"},
    {repository: "https://user:password@example.test/demo"},
    {repository: "https://example.test/demo", ref: "--upload-pack=evil"},
    {repository: "https://example.test/demo", ref: "main:refs/heads/other"},
    {repository: "https://example.test/demo", path: "../outside"},
  ])("rejects credentials, unsupported transports and unsafe refs/paths: %j", source => {
    expect(() => gitPackageSource(source)).toThrow()
  })

  it("accepts arbitrary anonymous hosts and slash-containing branch names", () => {
    expect(gitPackageSource({repository: "git://forge.example/demo.git", ref: "feature/widgets", path: "packages/widget"})).toEqual({
      repository: "git://forge.example/demo.git", ref: "feature/widgets", path: "packages/widget",
    })
  })
})
