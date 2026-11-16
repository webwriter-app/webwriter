import { can, isEditing, PermissionsCore, requestPermissions } from "@webwriter/widget/permissions";
import { CoreController } from "./base.js";
import { can as can2, isEditing as isEditing2 } from "@webwriter/widget/permissions";
class Permissions extends CoreController {
  constructor(host, options = {}) {
    super(host, (root) => new PermissionsCore(host, { ...options, root }));
  }
  /** True in edit mode, and in read mode when the author granted the permission. */
  can(name) {
    return this.core.can(name);
  }
  /** True in edit mode. */
  get editing() {
    return this.core.editing;
  }
}
function widgetPermissions(host) {
  let source;
  let unsubscribe;
  host.addController({
    hostConnected() {
      source = requestPermissions(host);
      unsubscribe = source?.subscribe(() => host.requestUpdate());
    },
    hostDisconnected() {
      unsubscribe?.();
      unsubscribe = source = void 0;
    }
  });
  return {
    can: (name) => source ? source.can(name) : can(host, name),
    get editing() {
      return source ? source.editing : isEditing(host);
    }
  };
}
export {
  Permissions,
  can2 as can,
  isEditing2 as isEditing,
  widgetPermissions
};
