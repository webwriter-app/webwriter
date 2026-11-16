import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} اٹھایا گیا۔ جگہ منتخب کرنے کے لیے تیر والے بٹن استعمال کریں، چھوڑنے کے لیے Enter دبائیں، منسوخ کرنے کے لیے Escape دبائیں۔`,
  pickedLink: item => `${item} کو جوڑا جا رہا ہے۔ جس سے جوڑنا ہے اسے منتخب کرنے کے لیے تیر والے بٹن استعمال کریں، جوڑنے کے لیے Enter دبائیں، منسوخ کرنے کے لیے Escape دبائیں۔`,
  selected: item => `${item} منتخب کیا گیا۔ جہاں رکھنا ہو وہاں کلک کریں، یا منسوخ کرنے کے لیے اس پر دوبارہ کلک کریں۔`,
  nextTarget: "Tab اگلے ہدف پر لے جاتا ہے۔",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}مقام ${position.index} از ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}بائیں سے ${x}، اوپر سے ${y}`,
  dropped: (item, target) => (target ? `${item} کو ${target} میں چھوڑا گیا۔` : `${item} کو چھوڑا گیا۔`),
  copied: (item, target) => (target ? `${item} کو ${target} میں شامل کیا گیا۔` : `${item} شامل کیا گیا۔`),
  linked: (item, target) => `${item} کو ${target} سے جوڑا گیا۔`,
  cancelled: () => "منسوخ کر دیا گیا۔",
  notAllowed: "منسوخ کر دیا گیا۔ اب یہاں اس کی اجازت نہیں ہے۔",
} satisfies Catalog<DragMessages>
