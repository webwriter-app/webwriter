import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} তোলা হয়েছে। জায়গা বেছে নিতে তীর কী, ছাড়তে Enter এবং বাতিল করতে Escape চাপুন।`,
  pickedLink: item => `${item} সংযুক্ত করা হচ্ছে। কীসের সঙ্গে সংযুক্ত করবেন তা বেছে নিতে তীর কী, সংযুক্ত করতে Enter এবং বাতিল করতে Escape চাপুন।`,
  selected: item => `${item} নির্বাচিত। যেখানে রাখতে চান সেখানে ক্লিক করুন, অথবা বাতিল করতে এটিতে আবার ক্লিক করুন।`,
  nextTarget: "Tab চাপলে পরবর্তী লক্ষ্যে যাওয়া যায়।",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count}টির মধ্যে অবস্থান ${position.index}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}বাঁ দিক থেকে ${x}, উপর থেকে ${y}`,
  dropped: (item, target) => (target ? `${item} ছাড়া হয়েছে: ${target}।` : `${item} ছাড়া হয়েছে।`),
  copied: (item, target) => (target ? `${item} যোগ করা হয়েছে: ${target}।` : `${item} যোগ করা হয়েছে।`),
  linked: (item, target) => `${item} ও ${target} সংযুক্ত হয়েছে।`,
  cancelled: () => "বাতিল করা হয়েছে।",
  notAllowed: "বাতিল করা হয়েছে। এখানে এটি আর অনুমোদিত নয়।",
} satisfies Catalog<DragMessages>
