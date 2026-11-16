var ka_default = {
  picked: (item) => `${item} აღებულია. ადგილის ასარჩევად გამოიყენეთ ისრების კლავიშები, ჩასადებად — Enter, გასაუქმებლად — Escape.`,
  pickedLink: (item) => `${item} უკავშირდება. სამიზნის ასარჩევად გამოიყენეთ ისრების კლავიშები, დასაკავშირებლად — Enter, გასაუქმებლად — Escape.`,
  selected: (item) => `${item} არჩეულია. დააწკაპუნეთ იქ, სადაც უნდა მოხვდეს, ან გასაუქმებლად ისევ დააწკაპუნეთ მასზე.`,
  nextTarget: "Tab გადადის შემდეგ სამიზნეზე.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}პოზიცია ${position.index} / ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}მარცხნიდან ${x}, ზემოდან ${y}`,
  dropped: (item, target) => target ? `${item} ჩადებულია. სამიზნე: ${target}.` : `${item} ჩადებულია.`,
  copied: (item, target) => target ? `${item} დამატებულია. სამიზნე: ${target}.` : `${item} დამატებულია.`,
  linked: (item, target) => `${item} დაკავშირებულია. სამიზნე: ${target}.`,
  cancelled: () => "გაუქმებულია.",
  notAllowed: "გაუქმებულია. ეს მოქმედება აქ აღარ არის დაშვებული."
};
export {
  ka_default as default
};
