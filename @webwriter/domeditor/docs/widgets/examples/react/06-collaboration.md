Move the selected answer into the direct JSON data block. The custom-element class listens on itself, accepts datachange and dataerror only from its current direct data block, and removes both listeners when disconnected. A light-DOM observer invalidates readiness when that block is replaced. React subscribes to a small host revision with useSyncExternalStore; each render reads the current direct block and its latest textContent, so accepted remote snapshots update the displayed answer without writing during rendering. The host installs its data listeners before mounting React, and the hook checks the current snapshot when its subscription starts.

~~~jsx
// The host creates one stable subscription and snapshot function.
subscribe = listener => {
  this.listeners.add(listener)
  return () => this.listeners.delete(listener)
}
getSnapshot = () => this.revision

update() {
  this.revision += 1
  for(const listener of this.listeners) listener()
}

function ReactQuiz({host}) {
  useSyncExternalStore(host.subscribe, host.getSnapshot, host.getSnapshot)
  const block = host.block
  const ready = Boolean(block && block === host.readyBlock)
  // Read the current authored JSON directly during render.
  const choice = host.choice
  return <output>{host.error || (ready ? choice : "Loading answers…")}</output>
}
~~~

06-collaboration.jsx includes readiness gating, error display, shared change handling, and the final widget class. quiz.html provides the authored question and initial data block.
