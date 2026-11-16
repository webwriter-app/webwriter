var ml_default = {
  picked: (item) => `എടുത്തത്: ${item}. സ്ഥലം തിരഞ്ഞെടുക്കാൻ ആരോ കീകളും, ഇടാൻ Enter-ഉം, റദ്ദാക്കാൻ Escape-ഉം അമർത്തുക.`,
  pickedLink: (item) => `ബന്ധിപ്പിക്കുന്നു: ${item}. എന്തിനോടാണ് ബന്ധിപ്പിക്കേണ്ടതെന്ന് തിരഞ്ഞെടുക്കാൻ ആരോ കീകളും, ബന്ധിപ്പിക്കാൻ Enter-ഉം, റദ്ദാക്കാൻ Escape-ഉം അമർത്തുക.`,
  selected: (item) => `തിരഞ്ഞെടുത്തത്: ${item}. എവിടെ വയ്ക്കണമോ അവിടെ ക്ലിക്ക് ചെയ്യുക, അല്ലെങ്കിൽ റദ്ദാക്കാൻ ഇതിൽ വീണ്ടും ക്ലിക്ക് ചെയ്യുക.`,
  nextTarget: "Tab അമർത്തിയാൽ അടുത്ത ലക്ഷ്യത്തിലേക്ക് പോകും.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count} എണ്ണത്തിൽ സ്ഥാനം ${position.index}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}ഇടത്തുനിന്ന് ${x}, മുകളിൽനിന്ന് ${y}`,
  dropped: (item, target) => target ? `ഇട്ടത്: ${item}, സ്ഥലം: ${target}.` : `ഇട്ടത്: ${item}.`,
  copied: (item, target) => target ? `ചേർത്തത്: ${item}, സ്ഥലം: ${target}.` : `ചേർത്തത്: ${item}.`,
  linked: (item, target) => `${item}, ${target} എന്നിവ ബന്ധിപ്പിച്ചു.`,
  cancelled: () => "റദ്ദാക്കി.",
  notAllowed: "റദ്ദാക്കി. ഇവിടെ ഇത് ഇനി അനുവദനീയമല്ല."
};
export {
  ml_default as default
};
