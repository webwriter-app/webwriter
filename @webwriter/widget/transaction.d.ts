/** `detail` of the `ww-transactionend` that a former ancestor sends for a host that left the document. */
export type TransactionEndDetail = {
    host: Element;
};
/** True while a `transaction()` of this host is open, also between a change and the promise it returned. */
export declare function transactionOpen(host: Element): boolean;
/**
 * Runs `change` as one undo step: `ww-transactionstart` is dispatched on the
 * host before it and `ww-transactionend` after it, also when it throws. If
 * `change` returns a promise, the transaction ends when the promise settles.
 * Nested calls for the same host send only the outermost pair.
 *
 * If the host leaves the document while the transaction is open, the
 * transaction ends at once. The host's own end event no longer reaches the
 * document, so a second one is sent from the nearest former ancestor that is
 * still connected, with `detail.host`: whoever counts the pairs there stays
 * balanced. A host that is moved (removed and inserted again in the same
 * task) stays open.
 */
export declare function transaction<T>(host: Element, change: () => T): T;
