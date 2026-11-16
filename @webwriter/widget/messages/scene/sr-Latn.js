var sr_Latn_default = {
  selection: (count) => count === 0 ? "Izbor je poništen." : count === 1 ? "Izabran je 1 element." : `Izabrani elementi: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Premešteno." : `Premešteni elementi: ${count}.`,
  notMoved: "Nije premešteno.",
  port: (port, node) => `${port} na ${node}`,
  linkPort: (port) => `Poveži od ${port}`,
  wiring: (from, count) => count === 1 ? `Veza od ${from}. Prihvata je 1 priključak. Strelicama birate, tasterom Enter povezujete, tasterom Escape odustajete.` : `Veza od ${from}. Priključci koji je prihvataju: ${count}. Strelicama birate, tasterom Enter povezujete, tasterom Escape odustajete.`,
  target: (to, index, count) => `${to}, ${index} od ${count}.`,
  noTarget: "Nijedan priključak ne prihvata ovu vezu.",
  connected: (from, to) => `${from} je povezano sa ${to}.`,
  notConnected: "Nije povezano."
};
export {
  sr_Latn_default as default
};
