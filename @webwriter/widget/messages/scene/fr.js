var fr_default = {
  selection: (count) => count === 0 ? "Sélection effacée." : count === 1 ? "1 élément sélectionné." : `${count} éléments sélectionnés.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Déplacé." : `${count} éléments déplacés.`,
  notMoved: "Non déplacé.",
  port: (port, node) => `${port} de ${node}`,
  linkPort: (port) => `Relier depuis ${port}`,
  wiring: (from, count) => count === 1 ? `Fil depuis ${from}. 1 port l’accepte. Les flèches choisissent, Entrée relie, Échap annule.` : `Fil depuis ${from}. ${count} ports l’acceptent. Les flèches choisissent, Entrée relie, Échap annule.`,
  target: (to, index, count) => `${to}, ${index} sur ${count}.`,
  noTarget: "Aucun port n’accepte ce fil.",
  connected: (from, to) => `${from} relié à ${to}.`,
  notConnected: "Non relié."
};
export {
  fr_default as default
};
