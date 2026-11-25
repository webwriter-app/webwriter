// @vitest-environment node
import {execFile, spawn} from "node:child_process"
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {promisify} from "node:util"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

const execute = promisify(execFile)
const script = fileURLToPath(new URL("./ish-tunnel.sh", import.meta.url))
let directory: string
let state: string
let env: NodeJS.ProcessEnv
const run = (command: string) => execute("sh", [script, command], {env})
const read = (name: string) => readFile(join(directory, name), "utf8")
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
const processWait = {timeout: 4_000}
const pidOf = async (name: string) => {
  const pid = Number((await read(name)).trim())
  expect(pid).toBeGreaterThan(0)
  return pid
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ish tunnel "))
  state = join(directory, "state")
  const bin = join(directory, "bin")
  await mkdir(bin)
  await writeFile(join(directory, "location"), "")
  await writeFile(join(bin, "setsid"), '#!/bin/sh\nexec "$@"\n', {mode: 0o700})
  await writeFile(join(bin, "cat"), `#!/bin/sh
printf '%s' "$$" > "$MOCK_DIRECTORY/location-pid"
trap 'exit 0' TERM INT HUP
while :; do sleep 0.1; done
`, {mode: 0o700})
  await writeFile(join(bin, "ssh"), `#!/bin/sh
printf '%s\\n' "$*" >> "$MOCK_DIRECTORY/calls"
[ -f "$MOCK_DIRECTORY/available" ] || exit 255
printf '%s' "$$" > "$MOCK_DIRECTORY/ssh-pid"
trap 'exit 0' TERM INT HUP
while [ -f "$MOCK_DIRECTORY/available" ]; do sleep 0.1; done
exit 255
`, {mode: 0o700})
  env = {...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_DIRECTORY: directory,
    WEBWRITER_TUNNEL_STATE_DIR: state, WEBWRITER_TUNNEL_LOCATION: join(directory, "location"),
    WEBWRITER_TUNNEL_RETRY_SECONDS: "1"}
})

afterEach(async () => {
  await run("stop").catch(() => {})
  await vi.waitFor(async () => {
    await expect(readFile(join(state, "lock/pid"))).rejects.toThrow()
  }, processWait)
  await rm(directory, {recursive: true, force: true})
})

describe("iSH tunnel supervisor", () => {
  it("waits for an unavailable Mac and reconnects after losing a working tunnel", async () => {
    await run("start")
    await vi.waitFor(async () => expect((await read("calls")).trim()).not.toBe(""), processWait)
    await writeFile(join(directory, "available"), "")
    await vi.waitFor(async () => expect(alive(await pidOf("ssh-pid"))).toBe(true), processWait)
    const first = await pidOf("ssh-pid")
    await rm(join(directory, "available"))
    await vi.waitFor(() => expect(alive(first)).toBe(false), processWait)
    await writeFile(join(directory, "available"), "")
    await vi.waitFor(async () => {
      const second = await pidOf("ssh-pid")
      expect(second).not.toBe(first)
      expect(alive(second)).toBe(true)
    }, processWait)
    expect((await run("status")).stdout).toContain("may still be reconnecting")
    const calls = await read("calls")
    expect(calls).toContain("BatchMode=yes")
    expect(calls).toContain("StrictHostKeyChecking=yes")
    expect(calls).toContain("ServerAliveInterval=15")
    expect(calls).toContain("ExitOnForwardFailure=yes")
    expect(calls).toContain("-L localhost:1234:127.0.0.1:1234 webwriter-mac")
  })

  it("keeps one supervisor across concurrent startup hooks and stops its owned children", async () => {
    await writeFile(join(directory, "available"), "")
    await Promise.all([run("start"), run("start"), run("start")])
    const {location, ssh} = await vi.waitFor(async () => {
      const location = await pidOf("location-pid"), ssh = await pidOf("ssh-pid")
      expect(alive(location)).toBe(true)
      expect(alive(ssh)).toBe(true)
      return {location, ssh}
    }, processWait)
    expect((await read("calls")).trim().split("\n")).toHaveLength(1)
    await run("stop")
    await vi.waitFor(() => {
      expect(alive(location)).toBe(false)
      expect(alive(ssh)).toBe(false)
    }, processWait)
    await expect(run("status")).rejects.toThrow()
  })

  it("recovers a stale owner once across concurrent starts and leaves a reused PID alone", async () => {
    const unrelated = spawn("sleep", ["60"])
    try {
      await mkdir(join(state, "lock"), {recursive: true})
      await writeFile(join(state, "lock/pid"), `${unrelated.pid}\n`)
      expect((await run("stop")).stdout).toContain("not running")
      expect(alive(unrelated.pid!)).toBe(true)
      await writeFile(join(directory, "available"), "")
      await Promise.all([run("start"), run("start"), run("start")])
      await vi.waitFor(async () => expect(alive(await pidOf("ssh-pid"))).toBe(true), processWait)
      expect((await read("calls")).trim().split("\n")).toHaveLength(1)
      expect((await run("status")).stdout).toContain("running")
      expect(alive(unrelated.pid!)).toBe(true)
    }
    finally { unrelated.kill() }
  })

  it("runs a loopback-only SSH listener for USB with only the editor remote forward permitted", async () => {
    env.WEBWRITER_TUNNEL_MODE = "usb"
    env.WEBWRITER_TUNNEL_SSHD = join(directory, "bin/ssh")
    await writeFile(join(directory, "available"), "")
    await run("start")
    await vi.waitFor(async () => expect(alive(await pidOf("ssh-pid"))).toBe(true), processWait)
    const calls = await read("calls")
    expect(calls).toContain("-D -e -f /dev/null")
    expect(calls).toContain("ListenAddress=127.0.0.1")
    expect(calls).toContain("AllowTcpForwarding=remote")
    expect(calls).toContain("PermitListen=localhost:1234")
    expect(calls).toContain("GatewayPorts=no")
    expect(calls).toContain("AuthorizedKeysFile=/root/.ssh/webwriter-usb-authorized_keys")
    expect(calls).not.toContain("webwriter-mac")
    const server = await pidOf("ssh-pid")
    await run("stop")
    await vi.waitFor(() => expect(alive(server)).toBe(false), processWait)
  })
})
