import {LitElement} from "lit"
import {SignalWatcher} from "@lit-labs/signals"
import {signal} from "signal-utils"
import Hotkeys from "hotkeys-js"


export function isOnApple() {
  return navigator.platform.startsWith("Mac") || navigator.platform.startsWith("iPhone") || navigator.platform.startsWith("iPad")
}

type Optionalized<T> = { [K in keyof T]: T[K] | undefined };

interface CommandConfig {
  shortcut?: {
    "pc": string,
    "mac": string
  } | string
  /** Do not call preventDefault on shortcut invocation. */
  allowDefault?: boolean
  /** Whether the shortcut has been changed from the default. */
  fixedShortcut?: boolean
  /** Icon of the command for the user. */
  icon?: string
  /** Description of the commmand for the user. */
  description?: string
  /** Label of the command for the user. */
  label?: string
  /** Time in milliseconds after which the execution is aborted. */
  timeout?: number
  /** Whether to abort the current run and start another when executed while already running. */
  abortOnRetry?: boolean
  /** Automatically repeat running the command every n milliseconds after the first run until aborted. */
  scheduledInterval?: number
}

// Features: disable, cancel, 
class Command<A extends unknown[] = any[], T extends unknown = any> {

  static TIMEOUT_ABORT = Symbol("TIMEOUT_ABORT")

  static TimeoutError = class TimeoutError extends Error {}
  static RetryError = class RetryError extends Error {}

  static #instances = new Set() as Set<Command>
  static get instances() {
    return this.#instances as ReadonlySet<Command>
  }

  #run: (...args: [{signal: AbortSignal}, ...rest: Optionalized<A>]) => T

  #abortController = new AbortController()

  constructor(run: (...args: [{signal: AbortSignal}, ...rest: Optionalized<A>]) => T, readonly config: CommandConfig = {}) {
    this.#run = run
    let sc; if(sc = this.config.shortcut) {
      this.shortcut = typeof sc === "string"? sc: (isOnApple()? sc.mac: sc.pc)
    }
  }

  #shortcut?: string

  set shortcut(value: string | undefined) {
    if(!value) {
      Hotkeys.unbind(value)
    }
    else {
      Hotkeys(value, {element: document.documentElement}, event => {
        if(!this.config.allowDefault) event.preventDefault();
        this.run(...[] as any)
      })
    }
    this.#shortcut = value
  }

  get shortcut() {
    return this.#shortcut
  }

  #isRunning = false
  #interval: number

  @signal accessor isDisabled = false
  @signal accessor error: Error | null | undefined
  @signal accessor result: T | undefined

  @signal get status(): "disabled" | "ready" | "pending" | "completed" | "error" {
    if(this.isDisabled) {
      return "disabled"
    }
    else if(this.#isRunning) {
      return "pending"
    }
    else if(this.error) {
      return "error"
    }
    else if(this.error === null) {
      return "completed"
    }
    else {
      return "ready"
    }
  }

  async run(...args: Optionalized<A>) {
    if(this.status === "disabled") {
      throw Error("Cannot run disabled command")
    }
    else if(this.config.abortOnRetry && this.status === "pending") {
      this.#abortController.abort(new Command.RetryError())
    }
    else if(!this.config.abortOnRetry && this.status === "pending") {
      throw Error("Cannot run this command while another run is pending")
    }
    this.#isRunning = true
    this.error = this.result = undefined
    this.#abortController = new AbortController()
    this.#abortController.signal.addEventListener("abort", () => {
      if(!(this.#abortController.signal.reason instanceof Command.RetryError)) {
        this.error = this.#abortController.signal.reason
      }
      this.#isRunning = false
    })
    try {
      const result = await (!this.config.timeout
        ? this.#run({signal: this.#abortController.signal}, ...args)
        : Promise.race([
          this.#run({signal: this.#abortController.signal}, ...args),
          new Promise(r => setTimeout(() => {
            this.#abortController.abort(new Command.TimeoutError("Command timed out"))
            r(Command.TIMEOUT_ABORT)
          }, this.config.timeout))
        ]))
      if(result === Command.TIMEOUT_ABORT) {
        this.#abortController.signal.throwIfAborted()
      }
      else {
        this.result = result as T
      }
    } catch(error: any) {
      this.error = error
    } finally {
      this.#isRunning = false
    }
  }

  abort(reason?: Error) {
    if(!this.#isRunning) throw Error("Cannot abort command that is not running")
    return this.#abortController.abort(reason)
  }
}

export class View extends SignalWatcher(LitElement) {}

class Editor extends View {

  foo = new Command(({signal}, greeting?: string) => {

  })

  bar() {
    this.foo.run()
  }
}
