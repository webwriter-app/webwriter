var jv_default = {
  selection: (count) => count === 0 ? "Pilihan dibusak." : count === 1 ? "1 item dipilih." : `${count} item dipilih.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Dipindhah." : `${count} item dipindhah.`,
  notMoved: "Ora dipindhah.",
  port: (port, node) => `${port} ing ${node}`,
  linkPort: (port) => `Sambungake saka ${port}`,
  wiring: (from, count) => count === 1 ? `Kabel saka ${from}. 1 port bisa nampa. Tombol panah milih, Enter nyambungake, Escape mbatalake.` : `Kabel saka ${from}. ${count} port bisa nampa. Tombol panah milih, Enter nyambungake, Escape mbatalake.`,
  target: (to, index, count) => `${to}, ${index} saka ${count}.`,
  noTarget: "Ora ana port sing nampa kabel iki.",
  connected: (from, to) => `${from} disambungake menyang ${to}.`,
  notConnected: "Ora disambungake."
};
export {
  jv_default as default
};
