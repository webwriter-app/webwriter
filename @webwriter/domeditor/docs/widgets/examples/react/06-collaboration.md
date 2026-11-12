Store the selected answer in the JSON data block. This block is a direct child of the widget. Listen for `datachange` and `dataerror` on the custom element. Accept events only from the current block. Remove the listeners when the element disconnects. The observer makes the widget wait for new data when the block changes.

The custom element adds its data listeners before React mounts. React uses `useSyncExternalStore` to receive update notifications. The hook checks the current data when it subscribes. During rendering, React reads the latest `textContent` from the current block. This updates the answer when data changes.

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

The complete widget is in `06-collaboration.jsx`. It waits for data, shows errors, and updates the view when data changes. The `quiz.html` file contains the question and the initial data block.
