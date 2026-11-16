import { runtimeMsg } from "@lit/localize/internal/runtime-msg.js";
import { LOCALIZE_REQUEST, LocalizeCore } from "@webwriter/widget/localize";
import { CoreController } from "./base.js";
import { LOCALE_ALIASES, matchLocale } from "@webwriter/widget/localize";
function localizer(host, options) {
  const { core } = new CoreController(host, () => new LocalizeCore(host, options));
  return {
    getLocale: () => core.getLocale(),
    setLocale: (tag) => core.setLocale(tag),
    msg: msgOf(() => core),
    get loaded() {
      return core.loaded;
    }
  };
}
function msgOf(core) {
  return ((template, options) => runtimeMsg(core()?.getSnapshot().templates, template, options));
}
function widgetMsg(host) {
  let core;
  let unsubscribe;
  host.addController({
    hostConnected() {
      const detail = { provide: (provided) => core = provided };
      host.dispatchEvent(new CustomEvent(LOCALIZE_REQUEST, { detail, bubbles: true, composed: true }));
      unsubscribe = core?.subscribe(() => host.requestUpdate());
    },
    hostDisconnected() {
      unsubscribe?.();
      unsubscribe = core = void 0;
    }
  });
  return msgOf(() => core);
}
export {
  LOCALE_ALIASES,
  localizer,
  matchLocale,
  widgetMsg
};
