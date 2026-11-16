import {useMemo} from "react"
import {ShortcutsCore} from "@webwriter/widget/shortcuts"
import {useActions, useCore} from "./base.js"

/**
 * React binding of Shortcuts. The keys are declared on the class, in
 * `static actions`; `handlers` are the functions that run (they become
 * methods of the host, see `useActions()`). A key runs one as one undo step
 * that stays open until React rendered. A handler that returns `false` declines
 * the key: it had nothing to do, and the key goes to the next action that has it.
 */
export function useShortcuts(host, handlers, options) {
  const {core, snapshot} = useCore(host, (o, rendered) => new ShortcutsCore(host, {rendered, ...o}), options)
  useActions(host, handlers)
  const methods = useMemo(() => ({
    keysOf: (action) => core.keysOf(action),
    labelsOf: (action) => core.labelsOf(action),
  }), [core, snapshot])
  return {running: snapshot.running, ...methods}
}
