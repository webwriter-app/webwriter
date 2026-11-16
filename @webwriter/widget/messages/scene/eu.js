var eu_default = {
  selection: (count) => count === 0 ? "Hautapena garbitu da." : count === 1 ? "Elementu 1 hautatu da." : `Hautatutako elementuak: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Mugitu da." : `Mugitutako elementuak: ${count}.`,
  notMoved: "Ez da mugitu.",
  port: (port, node) => `${node}(r)en ${port}`,
  linkPort: (port) => `Konektatu ${port} atetik`,
  wiring: (from, count) => count === 1 ? `Kablea ${from} atetik. Ate 1ek onartzen du. Geziek aukeratzen dute, Sartuk konektatzen du, Esc-ek ezeztatzen du.` : `Kablea ${from} atetik. Onartzen duten ateak: ${count}. Geziek aukeratzen dute, Sartuk konektatzen du, Esc-ek ezeztatzen du.`,
  target: (to, index, count) => `${to}, ${count}tik ${index}.`,
  noTarget: "Ez dago kable hau onartzen duen aterik.",
  connected: (from, to) => `${from} eta ${to} konektatu dira.`,
  notConnected: "Ez da konektatu."
};
export {
  eu_default as default
};
