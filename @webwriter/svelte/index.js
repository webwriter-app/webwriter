export * from "@webwriter/widget"

/** Read the widget's DOM-backed snapshot via Svelte's store contract. */
export function widgetStore(host) {
  const {getSnapshot, subscribe} = host.widgetRuntime
  return {
    subscribe(run) {
      let snapshot = getSnapshot()
      run(snapshot)
      return subscribe(() => {
        const next = getSnapshot()
        if(next === snapshot) return
        snapshot = next
        run(next)
      })
    },
  }
}
