var ms_default = {
  selection: (count) => count === 0 ? "Pilihan dikosongkan." : count === 1 ? "1 item dipilih." : `${count} item dipilih.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Dialihkan." : `${count} item dialihkan.`,
  notMoved: "Tidak dialihkan.",
  port: (port, node) => `${port} pada ${node}`,
  linkPort: (port) => `Sambung dari ${port}`,
  wiring: (from, count) => count === 1 ? `Wayar dari ${from}. 1 port boleh menerimanya. Kekunci anak panah memilih, Enter menyambung, Escape membatalkan.` : `Wayar dari ${from}. ${count} port boleh menerimanya. Kekunci anak panah memilih, Enter menyambung, Escape membatalkan.`,
  target: (to, index, count) => `${to}, ${index} daripada ${count}.`,
  noTarget: "Tiada port yang menerima wayar ini.",
  connected: (from, to) => `${from} disambungkan ke ${to}.`,
  notConnected: "Tidak disambungkan."
};
export {
  ms_default as default
};
