var ml_default = {
  selection: (count) => count === 0 ? "തിരഞ്ഞെടുപ്പ് നീക്കി." : count === 1 ? "1 ഇനം തിരഞ്ഞെടുത്തു." : `തിരഞ്ഞെടുത്ത ഇനങ്ങൾ: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "നീക്കി." : `നീക്കിയ ഇനങ്ങൾ: ${count}.`,
  notMoved: "നീക്കിയില്ല.",
  port: (port, node) => `${port} (${node})`,
  linkPort: (port) => `ബന്ധിപ്പിക്കുക, ആരംഭം: ${port}`,
  wiring: (from, count) => count === 1 ? `വയർ ബന്ധിപ്പിക്കുന്നു, ആരംഭം: ${from}. 1 പോർട്ട് ഇത് സ്വീകരിക്കുന്നു. തിരഞ്ഞെടുക്കാൻ ആരോ കീകളും, ബന്ധിപ്പിക്കാൻ Enter-ഉം, റദ്ദാക്കാൻ Escape-ഉം അമർത്തുക.` : `വയർ ബന്ധിപ്പിക്കുന്നു, ആരംഭം: ${from}. ഇത് സ്വീകരിക്കുന്ന പോർട്ടുകൾ: ${count}. തിരഞ്ഞെടുക്കാൻ ആരോ കീകളും, ബന്ധിപ്പിക്കാൻ Enter-ഉം, റദ്ദാക്കാൻ Escape-ഉം അമർത്തുക.`,
  target: (to, index, count) => `${to}, ${count} എണ്ണത്തിൽ ${index}.`,
  noTarget: "ഒരു പോർട്ടും ഈ വയർ സ്വീകരിക്കുന്നില്ല.",
  connected: (from, to) => `${from}, ${to} എന്നിവ ബന്ധിപ്പിച്ചു.`,
  notConnected: "ബന്ധിപ്പിച്ചില്ല."
};
export {
  ml_default as default
};
