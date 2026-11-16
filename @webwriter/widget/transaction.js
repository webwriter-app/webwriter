const open = /* @__PURE__ */ new WeakMap();
function send(target, type, detail) {
  target.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}
function ancestors(host) {
  const path = [];
  for (let node = host; node; ) {
    node = node instanceof ShadowRoot ? node.host : node.parentNode;
    if (node) path.push(node);
  }
  return path;
}
function close(host, state) {
  if (open.get(host) !== state) return;
  open.delete(host);
  state.watch?.disconnect();
  const former = host.isConnected ? void 0 : state.path.find((node) => node.isConnected);
  send(host, "ww-transactionend");
  if (former) send(former, "ww-transactionend", { host });
}
function watch(host, state) {
  if (state.watch || !host.isConnected) return;
  state.watch = new MutationObserver(() => {
    if (!host.isConnected) close(host, state);
  });
  for (const node of state.path) {
    if (node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) state.watch.observe(node, { childList: true, subtree: true });
  }
}
function transactionOpen(host) {
  return open.has(host);
}
function transaction(host, change) {
  let state = open.get(host);
  if (state) state.depth++;
  else {
    state = { depth: 1, path: ancestors(host) };
    open.set(host, state);
    send(host, "ww-transactionstart");
  }
  const current = state;
  const end = () => {
    if (--current.depth === 0) close(host, current);
  };
  let result;
  try {
    result = change();
  } catch (error) {
    end();
    throw error;
  }
  if (result instanceof Promise) {
    watch(host, current);
    return result.finally(end);
  }
  end();
  return result;
}
export {
  transaction,
  transactionOpen
};
