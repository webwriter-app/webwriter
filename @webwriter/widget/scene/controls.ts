// What a scene does for its reader's targets and for the theme of the page: controls inside nodes that keep their
// size when the view is zoomed out, and the restyle after the editor tells that the document theme changed.

/** The event the editor sends on the document after the document theme changed. It bubbles and carries no data a widget needs. */
export const THEME_CHANGE = "ww-themechange"

const controls = new CSSStyleSheet()
// A rule without specificity, so that any rule of the widget wins. The scene writes `--ww-scene-counter` (1 divided by the zoom) on its layer.
controls.replaceSync(
  ":where([data-ww-control]) { transform-origin: var(--ww-control-origin, center); scale: min(max(1, var(--ww-scene-counter, 1)), var(--ww-control-limit, 6)); }",
)

const scenes = new WeakMap<Document | ShadowRoot, number>()

/**
 * Makes `[data-ww-control]` elements in the tree of `root` keep their size on the screen while the view is zoomed
 * out. The rule is adopted into the root, so that it reaches the nodes the widget renders: a constructed sheet,
 * which writes nothing into the document. Returns what takes it away again when the last scene of the root is gone.
 */
export function adoptControls(root: Node): () => void {
  if(!(root instanceof Document || root instanceof ShadowRoot)) return () => {}
  scenes.set(root, (scenes.get(root) ?? 0) + 1)
  if(!root.adoptedStyleSheets.includes(controls)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, controls]
  return () => {
    const left = (scenes.get(root) ?? 1) - 1
    scenes.set(root, left)
    if(left <= 0) root.adoptedStyleSheets = root.adoptedStyleSheets.filter(sheet => sheet !== controls)
  }
}
