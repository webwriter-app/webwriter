var fi_default = {
  selection: (count) => count === 0 ? "Valinta tyhjennetty." : count === 1 ? "1 kohde valittu." : `Valittuja kohteita: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Siirretty." : `Siirrettyjä kohteita: ${count}.`,
  notMoved: "Ei siirretty.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: (port) => `Aloita yhdistäminen: ${port}`,
  wiring: (from, count) => count === 1 ? `Johdin: ${from}. Sen hyväksyy 1 portti. Valitse nuolinäppäimillä, yhdistä Enter-näppäimellä, peruuta Escape-näppäimellä.` : `Johdin: ${from}. Sen hyväksyviä portteja: ${count}. Valitse nuolinäppäimillä, yhdistä Enter-näppäimellä, peruuta Escape-näppäimellä.`,
  target: (to, index, count) => `${to}, ${index}, yhteensä ${count}.`,
  noTarget: "Mikään portti ei hyväksy tätä johdinta.",
  connected: (from, to) => `Yhdistetty: ${from} ja ${to}.`,
  notConnected: "Ei yhdistetty."
};
export {
  fi_default as default
};
