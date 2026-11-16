const EPSILON = 1e-6;
const fitIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>`;
const buttons = [
  { action: "out", content: "−", keys: "-" },
  { action: "in", content: "+", keys: "+" },
  { action: "reset", content: "", keys: "" },
  { action: "fit", content: fitIcon, keys: "0" }
];
const controlsCss = `
:where([data-ww-viewport-controls]) { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 6px; background: Canvas; color: CanvasText; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.15); }
:where([data-ww-viewport-action]) { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 4px; border: 0; border-radius: 4px; background: none; color: inherit; font: 13px/1 system-ui, sans-serif; cursor: pointer; }
:where([data-ww-viewport-action]:hover:not([aria-disabled="true"])) { background: rgb(0 0 0 / 0.08); }
:where([data-ww-viewport-action][aria-disabled="true"]) { opacity: 0.4; cursor: default; }
`;
const own = ":scope > [data-ww-viewport-action]";
function renderControls(root, state) {
  const { scale, min, max, locked, messages } = state;
  const percent = Math.round(scale * 100);
  const names = { out: messages.zoomOut, in: messages.zoomIn, reset: messages.reset(percent), fit: messages.fit };
  const text = messages.percent(percent);
  for (const box of root.querySelectorAll("[data-ww-viewport-controls]")) {
    if (!box.querySelector(own)) {
      box.append(
        ...buttons.map(({ action, content, keys }) => {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-ww-viewport-action", action);
          if (keys) button.setAttribute("aria-keyshortcuts", keys);
          button.innerHTML = content;
          return button;
        })
      );
    }
    for (const button of box.querySelectorAll(own)) {
      const action = button.getAttribute("data-ww-viewport-action");
      const disabled = locked || action === "out" && scale <= min + EPSILON || action === "in" && scale >= max - EPSILON;
      if (button.getAttribute("aria-disabled") === "true" !== disabled) {
        if (disabled) button.setAttribute("aria-disabled", "true");
        else button.removeAttribute("aria-disabled");
      }
      if (button.getAttribute("aria-label") !== names[action]) {
        button.setAttribute("aria-label", names[action]);
        button.title = names[action];
      }
      if (action === "reset" && button.textContent !== text) button.textContent = text;
    }
  }
}
function removeControls(root) {
  for (const button of root.querySelectorAll(`[data-ww-viewport-controls] > [data-ww-viewport-action]`)) button.remove();
}
function clickedAction(event, root) {
  const button = event.target.closest?.("[data-ww-viewport-controls] > [data-ww-viewport-action]");
  if (!button || !root.contains(button) || button.getAttribute("aria-disabled") === "true") return null;
  return button.getAttribute("data-ww-viewport-action");
}
export {
  clickedAction,
  controlsCss,
  removeControls,
  renderControls
};
