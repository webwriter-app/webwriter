var te_default = {
  selection: (count) => count === 0 ? "ఎంపిక తీసివేయబడింది." : count === 1 ? "1 అంశం ఎంచుకోబడింది." : `ఎంచుకున్న అంశాలు: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "తరలించబడింది." : `తరలించిన అంశాలు: ${count}.`,
  notMoved: "తరలించలేదు.",
  port: (port, node) => `${port} (${node})`,
  linkPort: (port) => `${port} నుండి కలపండి`,
  wiring: (from, count) => count === 1 ? `${from} నుండి వైర్ కలుపుతున్నారు. 1 పోర్ట్ దీన్ని అంగీకరిస్తుంది. ఎంచుకోవడానికి బాణం కీలు, కలపడానికి Enter, రద్దు చేయడానికి Escape నొక్కండి.` : `${from} నుండి వైర్ కలుపుతున్నారు. దీన్ని అంగీకరించే పోర్ట్‌లు: ${count}. ఎంచుకోవడానికి బాణం కీలు, కలపడానికి Enter, రద్దు చేయడానికి Escape నొక్కండి.`,
  target: (to, index, count) => `${to}, ${count} లో ${index}.`,
  noTarget: "ఏ పోర్ట్ ఈ వైర్‌ను అంగీకరించదు.",
  connected: (from, to) => `${from}, ${to} కలపబడ్డాయి.`,
  notConnected: "కలపబడలేదు."
};
export {
  te_default as default
};
