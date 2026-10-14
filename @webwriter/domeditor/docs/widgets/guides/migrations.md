# Migrate widget content

Export `./migrate.js` to update older widget HTML when it is pasted, dropped, or inserted from a snippet. The migration runs in a sandbox, outside the live document.

```js
document.addEventListener("migrate", event => {
  const widget = event.target
  if(widget.localName !== "ww-quiz" || !widget.hasAttribute("solution")) return
  widget.setAttribute("answer", widget.getAttribute("solution"))
  widget.removeAttribute("solution")
})
```

This example renames one attribute and preserves all other content. It is safe to run again because the old attribute is gone.

`event.detail` contains `{packageName, version}` for the installed package. Inspect the incoming element for its old format. Finish within three seconds, and do not depend on application state outside the sandbox.

Test old, current, and irregular but valid HTML. Preserve unrelated attributes, namespaces, children, and comments. See the [distribution reference](../reference/distribution.md).
