var hy_default = {
  picked: (item) => `${item}՝ վերցված է։ Տեղ ընտրելու համար օգտագործեք սլաքների ստեղները, տեղադրելու համար՝ Enter, չեղարկելու համար՝ Escape։`,
  pickedLink: (item) => `${item}՝ կապվում է։ Թիրախն ընտրելու համար օգտագործեք սլաքների ստեղները, կապելու համար՝ Enter, չեղարկելու համար՝ Escape։`,
  selected: (item) => `${item}՝ ընտրված է։ Սեղմեք այնտեղ, որտեղ պետք է հայտնվի, կամ չեղարկելու համար նորից սեղմեք դրա վրա։`,
  nextTarget: "Tab ստեղնը անցնում է հաջորդ թիրախին։",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}դիրք ${position.index}՝ ${position.count}-ից` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}ձախից ${x}, վերևից ${y}`,
  dropped: (item, target) => target ? `${item}՝ տեղադրվել է։ Թիրախ՝ ${target}։` : `${item}՝ տեղադրվել է։`,
  copied: (item, target) => target ? `${item}՝ ավելացվել է։ Թիրախ՝ ${target}։` : `${item}՝ ավելացվել է։`,
  linked: (item, target) => `${item}՝ կապվել է։ Թիրախ՝ ${target}։`,
  cancelled: () => "Չեղարկվեց։",
  notAllowed: "Չեղարկվեց։ Սա այստեղ այլևս թույլատրված չէ։"
};
export {
  hy_default as default
};
