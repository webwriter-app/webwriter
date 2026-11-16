var ha_default = {
  selection: (count) => count === 0 ? "An share zaɓin." : count === 1 ? "An zaɓi abu 1." : `Abubuwan da aka zaɓa: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "An motsa." : `Abubuwan da aka motsa: ${count}.`,
  notMoved: "Ba a motsa ba.",
  port: (port, node) => `${port} na ${node}`,
  linkPort: (port) => `Haɗa daga ${port}`,
  wiring: (from, count) => count === 1 ? `Waya daga ${from}. Tasha 1 tana karɓarta. Maɓallan kibiya suna zaɓa, Enter yana haɗawa, Escape yana sokewa.` : `Waya daga ${from}. Tashoshin da ke karɓarta: ${count}. Maɓallan kibiya suna zaɓa, Enter yana haɗawa, Escape yana sokewa.`,
  target: (to, index, count) => `${to}, ${index} cikin ${count}.`,
  noTarget: "Babu tashar da ke karɓar wannan wayar.",
  connected: (from, to) => `An haɗa ${from} da ${to}.`,
  notConnected: "Ba a haɗa ba."
};
export {
  ha_default as default
};
