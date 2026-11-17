const THEME_CHANGE = "ww-themechange";
const controls = new CSSStyleSheet();
controls.replaceSync(
  ":where([data-ww-control]) { transform-origin: var(--ww-control-origin, center); scale: min(max(1, var(--ww-scene-counter, 1)), var(--ww-control-limit, 6)); }"
);
const scenes = /* @__PURE__ */ new WeakMap();
function adoptControls(root) {
  if (!(root instanceof Document || root instanceof ShadowRoot)) return () => {
  };
  scenes.set(root, (scenes.get(root) ?? 0) + 1);
  if (!root.adoptedStyleSheets.includes(controls)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, controls];
  return () => {
    const left = (scenes.get(root) ?? 1) - 1;
    scenes.set(root, left);
    if (left <= 0) root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => sheet !== controls);
  };
}
export {
  THEME_CHANGE,
  adoptControls
};
