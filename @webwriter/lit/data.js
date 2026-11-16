import { JsonDataCore } from "@webwriter/widget/data";
import { CoreController } from "./base.js";
import { DATA_URL_LIMIT, fromDataURL, toDataURL } from "@webwriter/widget/data";
class JsonData extends CoreController {
  constructor(host, options) {
    super(host, (root) => new JsonDataCore(host, { ...options, root }));
  }
  /** The current value. The same object until the value changes. */
  get() {
    return this.core.get();
  }
  /** Changes some keys. The value changes at once; the block is written later. */
  set(partial, options) {
    this.core.set(partial, options);
  }
  /** Write a pending change now. */
  flush() {
    this.core.flush();
  }
  /** A change made with `set()` is not in the block yet. */
  get unsaved() {
    return this.snapshot.unsaved;
  }
  /** The block holds a snapshot that was ignored. Writes are held back until `set()` is forced or a valid one arrives. */
  get invalid() {
    return this.snapshot.invalid;
  }
}
function jsonData(host, options) {
  return new JsonData(host, options);
}
export {
  DATA_URL_LIMIT,
  JsonData,
  fromDataURL,
  jsonData,
  toDataURL
};
