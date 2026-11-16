var ga_default = {
  selection: (count) => count === 0 ? "Roghnú glanta." : count === 1 ? "Roghnaíodh 1 mhír." : `Míreanna roghnaithe: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Bogtha." : `Míreanna bogtha: ${count}.`,
  notMoved: "Gan bogadh.",
  port: (port, node) => `${port}, nód: ${node}`,
  linkPort: (port) => `Tosaigh nasc ag ${port}`,
  wiring: (from, count) => count === 1 ? `Nasc a thosaíonn ag ${from}. Glacann port amháin leis. Roghnaíonn na heochracha saigheada, nascann Enter, cealaíonn Escape.` : `Nasc a thosaíonn ag ${from}. Poirt a ghlacann leis: ${count}. Roghnaíonn na heochracha saigheada, nascann Enter, cealaíonn Escape.`,
  target: (to, index, count) => `${to}, ${index} as ${count}.`,
  noTarget: "Níl aon phort a ghlacann leis an nasc seo.",
  connected: (from, to) => `Nasctha: ${from} agus ${to}.`,
  notConnected: "Gan nascadh."
};
export {
  ga_default as default
};
