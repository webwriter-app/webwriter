var ckb_default = {
  picked: (item) => `${item} هەڵگیرا. بۆ هەڵبژاردنی شوێنێک کلیلەکانی تیر بەکاربهێنن، بۆ دانان Enter و بۆ هەڵوەشاندنەوە Escape بکەن.`,
  pickedLink: (item) => `${item} بەستراوەتەوە. بۆ هەڵبژاردنی ئەوەی پێی دەبەستریتەوە کلیلەکانی تیر بەکاربهێنن، بۆ بەستنەوە Enter و بۆ هەڵوەشاندنەوە Escape بکەن.`,
  selected: (item) => `${item} هەڵبژێردرا. کرتە لەو شوێنە بکەن کە دەبێت بچێتە ئەوێ، یان بۆ هەڵوەشاندنەوە جارێکی تر کرتەی لێ بکەن.`,
  nextTarget: "Tab دەچێتە ئامانجی دواتر.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}شوێنی ${position.index} لە ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} لە لای چەپەوە، ${y} لە سەرەوە`,
  dropped: (item, target) => target ? `${item} لە ${target} دانرا.` : `${item} دانرا.`,
  copied: (item, target) => target ? `${item} زیاد کرا بۆ ${target}.` : `${item} زیاد کرا.`,
  linked: (item, target) => `${item} بە ${target} بەسترایەوە.`,
  cancelled: () => "هەڵوەشێنرایەوە.",
  notAllowed: "هەڵوەشێنرایەوە. ئەمە چیتر لێرە ڕێگەپێدراو نییە."
};
export {
  ckb_default as default
};
