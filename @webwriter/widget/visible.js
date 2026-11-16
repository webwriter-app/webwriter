function whileVisible(host, step, options = {}) {
  const maxDelta = options.maxDelta ?? 0.1;
  const scope = new AbortController();
  const view = host.ownerDocument.defaultView;
  let onScreen = false;
  let skipped = false;
  let frame = 0;
  let last;
  const tick = (now) => {
    frame = 0;
    if (!host.isConnected) return;
    const dt = last === void 0 ? 0 : Math.min((now - last) / 1e3, maxDelta);
    last = now;
    frame = requestAnimationFrame(tick);
    if (dt > 0) step(dt);
  };
  const update = () => {
    const shown = onScreen || host.isConnected && view?.getComputedStyle(host).display === "contents";
    const visible = !scope.signal.aborted && shown && !skipped && host.isConnected && host.ownerDocument.visibilityState === "visible";
    if (visible && !frame) {
      last = void 0;
      frame = requestAnimationFrame(tick);
    } else if (!visible && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  const observer = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    update();
  });
  observer.observe(host);
  host.addEventListener(
    "contentvisibilityautostatechange",
    (event) => {
      skipped = event.skipped;
      update();
    },
    { signal: scope.signal }
  );
  host.ownerDocument.addEventListener("visibilitychange", update, { signal: scope.signal });
  return {
    get running() {
      return frame !== 0;
    },
    stop() {
      observer.disconnect();
      scope.abort();
      update();
    }
  };
}
export {
  whileVisible
};
