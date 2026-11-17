// The data-block helper without a framework: a plain custom element on the
// shared runtime of @webwriter/widget, using only the core. The element is in
// `poll.ts`; this module defines it.
import { Poll } from "./poll";

export { Poll, type Vote } from "./poll";

customElements.define("ww-plain-poll", Poll);
