import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} נבחר להעברה. יש להשתמש במקשי החיצים כדי לבחור מקום, ב-Enter כדי להניח וב-Escape כדי לבטל.`,
  pickedLink: item => `מקשרים את ${item}. יש להשתמש במקשי החיצים כדי לבחור למה לקשר, ב-Enter כדי לקשר וב-Escape כדי לבטל.`,
  selected: item => `${item} נבחר. יש ללחוץ על המקום שאליו הוא צריך ללכת, או ללחוץ עליו שוב כדי לבטל.`,
  nextTarget: "מקש Tab עובר ליעד הבא.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}מיקום ${position.index} מתוך ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} משמאל, ${y} מלמעלה`,
  dropped: (item, target) => (target ? `${item} הונח אל ${target}.` : `${item} הונח.`),
  copied: (item, target) => (target ? `${item} נוסף אל ${target}.` : `${item} נוסף.`),
  linked: (item, target) => `${item} קושר אל ${target}.`,
  cancelled: () => "בוטל.",
  notAllowed: "בוטל. פעולה זו אינה מותרת עוד כאן.",
} satisfies Catalog<DragMessages>
