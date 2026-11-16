import { adoptStyles } from "./styles.js";
const regions = /* @__PURE__ */ new WeakMap();
const styles = `[data-ww-live] { position: absolute !important; width: 1px !important; height: 1px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; overflow: hidden !important; clip-path: inset(50%) !important; white-space: nowrap !important; }`;
function announcer(root) {
  let region = regions.get(root);
  if (!region) {
    const element2 = root.ownerDocument.createElement("div");
    element2.setAttribute("data-ww-live", "");
    element2.setAttribute("aria-live", "polite");
    element2.setAttribute("aria-atomic", "true");
    region = { element: element2, users: 0, removeStyles: adoptStyles(root, styles) };
    regions.set(root, region);
  }
  const { element } = region;
  const shared = region;
  shared.users++;
  let released = false;
  const place = () => {
    if (element.parentNode !== root) root.append(element);
  };
  place();
  return {
    announce(text) {
      if (released) return;
      place();
      element.textContent = text !== "" && text === element.textContent ? `${text} ` : text;
    },
    release() {
      if (released) return;
      released = true;
      if (--shared.users > 0) return;
      element.remove();
      shared.removeStyles();
      regions.delete(root);
    }
  };
}
export {
  announcer
};
