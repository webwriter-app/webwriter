var om_default = {
  selection: (count) => count === 0 ? "Filannoon haqameera." : count === 1 ? "Wanti 1 filatameera." : `Wantoonni filataman: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Sochoosameera." : `Wantoonni sochoosaman: ${count}.`,
  notMoved: "Hin sochoosamne.",
  port: (port, node) => `${port} kan ${node}`,
  linkPort: (port) => `${port} irraa wal qabsiisi`,
  wiring: (from, count) => count === 1 ? `Wayirii ${from} irraa. Boorti 1 ni fudhata. Furtuuwwan xiyyaa ni filatu, Enter wal qabsiisa, Escape haqa.` : `Wayirii ${from} irraa. Boortiiwwan fudhatan: ${count}. Furtuuwwan xiyyaa ni filatu, Enter wal qabsiisa, Escape haqa.`,
  target: (to, index, count) => `${to}, ${index} kan ${count}.`,
  noTarget: "Boortiin wayirii kana fudhatu hin jiru.",
  connected: (from, to) => `${from} ${to} waliin wal qabsiifameera.`,
  notConnected: "Wal hin qabsiifamne."
};
export {
  om_default as default
};
