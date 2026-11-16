var ku_Arab_default = {
  picked: (item) => `${item} هاتە هەلبژارتن. ب تیپێن تیران جهەکی هەلبژێرن، ب Enter بهاڤێژن، ب Escape بەتال بکەن.`,
  pickedLink: (item) => `${item} تێ گرێدان. ب تیپێن تیران هەلبژێرن کو ب چی ڕە بێ گرێدان، ب Enter گرێدەن، ب Escape بەتال بکەن.`,
  selected: (item) => `${item} هاتە هەلبژارتن. ل جهێ کو دڤێ بچە بتکێنن، یان بۆ بەتالکرنێ دیسا ل وی بتکێنن.`,
  nextTarget: "Tab دچە ئارمانجا دی.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}جه ${position.index} ژ ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} ژ چەپێ، ${y} ژ سەرێ`,
  dropped: (item, target) => target ? `${item} ل ${target} هاتە دانان.` : `${item} هاتە دانان.`,
  copied: (item, target) => target ? `${item} ل ${target} هاتە زێدەکرن.` : `${item} هاتە زێدەکرن.`,
  linked: (item, target) => `${item} ب ${target} ڕە هاتە گرێدان.`,
  cancelled: () => "هاتە بەتالکرن.",
  notAllowed: "هاتە بەتالکرن. ئێدی ل ڤێرێ مفا نینە."
};
export {
  ku_Arab_default as default
};
