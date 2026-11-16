var my_default = {
  selection: (count) => count === 0 ? "ရွေးချယ်မှုကို ဖယ်ရှားလိုက်ပါပြီ။" : count === 1 ? "ပစ္စည်း ၁ ခု ရွေးထားပါသည်။" : `ရွေးထားသော ပစ္စည်းအရေအတွက်- ${count}။`,
  moving: (x, y) => `x ${x}၊ y ${y}။`,
  moved: (count) => count === 1 ? "ရွှေ့လိုက်ပါပြီ။" : `ရွှေ့လိုက်သော ပစ္စည်းအရေအတွက်- ${count}။`,
  notMoved: "မရွှေ့ပါ။",
  port: (port, node) => `${node} ၏ ${port}`,
  linkPort: (port) => `${port} မှ ချိတ်ဆက်မှု စတင်ရန်`,
  wiring: (from, count) => count === 1 ? `${from} မှ ဝါယာကြိုး။ လက်ခံနိုင်သော ပို့တ်- ၁။ ရွေးရန် မြားခလုတ်များ၊ ချိတ်ရန် Enter၊ ပယ်ဖျက်ရန် Esc နှိပ်ပါ။` : `${from} မှ ဝါယာကြိုး။ လက်ခံနိုင်သော ပို့တ်အရေအတွက်- ${count}။ ရွေးရန် မြားခလုတ်များ၊ ချိတ်ရန် Enter၊ ပယ်ဖျက်ရန် Esc နှိပ်ပါ။`,
  target: (to, index, count) => `${to}၊ ${count} ခုအနက် ${index}။`,
  noTarget: "ဤဝါယာကြိုးကို လက်ခံနိုင်သော ပို့တ် မရှိပါ။",
  connected: (from, to) => `${from} ကို ${to} နှင့် ချိတ်ဆက်လိုက်ပါပြီ။`,
  notConnected: "မချိတ်ဆက်ရသေးပါ။"
};
export {
  my_default as default
};
