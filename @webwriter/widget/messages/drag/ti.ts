import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} ተሓዚዙ። ቦታ ንምምራጽ ምልክታት ቀስቲ ተጠቐሙ፣ ንምጥላዕ Enter፣ ንምስራዝ Escape ጠውቑ።`,
  pickedLink: item => `${item} ይተሓሓዝ ኣሎ። ዝተሓሓዘሉ ንምምራጽ ምልክታት ቀስቲ ተጠቐሙ፣ ንምትሕሓዝ Enter፣ ንምስራዝ Escape ጠውቑ።`,
  selected: item => `${item} ተመሪጹ። ክኸይድ ዝግባእ ቦታ ጠውቑ፣ ወይ ንምስራዝ ደጊምኩም ጠውቑዎ።`,
  nextTarget: "Tab ናብ ዝቕጽል ዕላማ የሰጋግር።",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}ቦታ ${position.index} ካብ ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}ካብ ጸጋም ${x}፣ ካብ ላዕሊ ${y}`,
  dropped: (item, target) => (target ? `${item} ኣብ ${target} ተጠሊዑ።` : `${item} ተጠሊዑ።`),
  copied: (item, target) => (target ? `${item} ናብ ${target} ተወሲኹ።` : `${item} ተወሲኹ።`),
  linked: (item, target) => `${item} ምስ ${target} ተተሓሒዙ።`,
  cancelled: () => "ተሰሪዙ።",
  notAllowed: "ተሰሪዙ። እዚ ኣብዚ ደሓር ኣይፍቀድን።",
} satisfies Catalog<DragMessages>
