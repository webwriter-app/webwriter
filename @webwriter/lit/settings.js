import { resolveDeclarations } from "@webwriter/widget";
import {
  SettingsCore,
  normalizeSetting,
  parseSetting,
  sameSetting,
  serializeSetting,
  settingAttribute,
  settingDefault
} from "@webwriter/widget/settings";
const stored = /* @__PURE__ */ new WeakMap();
const defined = /* @__PURE__ */ new WeakSet();
function defineSetting(Class, name, declaration) {
  const options = {
    attribute: settingAttribute(name, declaration),
    reflect: true,
    noAccessor: true,
    converter: {
      fromAttribute: (text) => parseSetting(declaration, text),
      toAttribute: (value) => serializeSetting(declaration, value)
    }
  };
  Class.createProperty(name, options);
  Object.defineProperty(Class.prototype, name, {
    get() {
      const values = stored.get(this);
      return values && name in values ? values[name] : settingDefault(declaration);
    },
    set(value) {
      const old = this[name];
      const next = normalizeSetting(declaration, value, old);
      if (sameSetting(next, old)) return;
      const values = stored.get(this) ?? stored.set(this, {}).get(this);
      values[name] = next;
      this.requestUpdate(name, old);
    },
    configurable: true,
    enumerable: true
  });
}
function Settings(base, declarations, options = {}) {
  class WithSettings extends base {
    static settings = declarations;
    // Lit calls this once per class before it reads `static properties`.
    static finalize() {
      if (!defined.has(this)) {
        defined.add(this);
        const own = Object.hasOwn(this, "settings") ? this.settings : void 0;
        for (const [name, declaration] of Object.entries(own ?? {})) defineSetting(this, name, declaration);
      }
      ;
      base.finalize.call(this);
    }
    settingsCore = new SettingsCore(this, { ...options, root: () => this.renderRoot, rendered: () => this.updateComplete });
    constructor(...args) {
      super(...args);
      const Class = this.constructor;
      for (const name of Object.keys(Class.settings ?? {})) this.requestUpdate(name, void 0, { ...Class.getPropertyOptions(name), reflect: false });
      const core = this.settingsCore;
      this.addController({
        hostConnected: () => core.connect(),
        hostDisconnected: () => core.disconnect(),
        hostUpdated: () => core.refresh()
      });
    }
    get options() {
      return { ...resolveDeclarations(this, this.constructor.options), ...this.settingsCore.editorOptions() };
    }
  }
  return WithSettings;
}
export {
  Settings
};
