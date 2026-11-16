var so_default = {
  picked: (item) => `${item} waa la qaaday. Isticmaal furayaasha fallaadhaha si aad meel u doorato, Enter si aad u dhigto, Escape si aad uga noqoto.`,
  pickedLink: (item) => `${item} waa la xirayaa. Isticmaal furayaasha fallaadhaha si aad u doorato waxa lagu xirayo, Enter si aad u xirto, Escape si aad uga noqoto.`,
  selected: (item) => `${item} waa la doortay. Guji meesha uu aadayo, ama mar kale guji si aad uga noqoto.`,
  nextTarget: "Tab wuxuu u wareejiyaa bartilmaameedka xiga.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}booska ${position.index} ee ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} bidix ahaan, ${y} kor ahaan`,
  dropped: (item, target) => target ? `${item} waxaa lagu dhigay ${target}.` : `${item} waa la dhigay.`,
  copied: (item, target) => target ? `${item} waxaa lagu daray ${target}.` : `${item} waa la daray.`,
  linked: (item, target) => `${item} waxaa lagu xiray ${target}.`,
  cancelled: () => "Waa la joojiyay.",
  notAllowed: "Waa la joojiyay. Tan halkan mar dambe lama oggola."
};
export {
  so_default as default
};
