var si_default = {
  selection: (count) => count === 0 ? "තේරීම ඉවත් කරන ලදී." : count === 1 ? "අයිතම 1ක් තෝරන ලදී." : `තෝරාගත් අයිතම: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "ගෙන යන ලදී." : `ගෙන ගිය අයිතම: ${count}.`,
  notMoved: "ගෙන ගියේ නැත.",
  port: (port, node) => `${port} (${node})`,
  linkPort: (port) => `${port} සිට සම්බන්ධ කරන්න`,
  wiring: (from, count) => count === 1 ? `${from} සිට වයරය සම්බන්ධ කරමින්. පෝට් 1ක් එය පිළිගනී. තේරීමට ඊතල යතුරු, සම්බන්ධ කිරීමට Enter, අවලංගු කිරීමට Escape ඔබන්න.` : `${from} සිට වයරය සම්බන්ධ කරමින්. එය පිළිගන්නා පෝට්: ${count}. තේරීමට ඊතල යතුරු, සම්බන්ධ කිරීමට Enter, අවලංගු කිරීමට Escape ඔබන්න.`,
  target: (to, index, count) => `${to}, ${count} න් ${index}.`,
  noTarget: "කිසිම පෝට් එකක් මෙම වයරය පිළිගන්නේ නැත.",
  connected: (from, to) => `${from} සහ ${to} සම්බන්ධ කරන ලදී.`,
  notConnected: "සම්බන්ධ කළේ නැත."
};
export {
  si_default as default
};
