import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "নির্বাচন সরানো হয়েছে।" : count === 1 ? "1টি আইটেম নির্বাচিত।" : `নির্বাচিত আইটেম: ${count}।`),
  moving: (x, y) => `x ${x}, y ${y}।`,
  moved: count => (count === 1 ? "সরানো হয়েছে।" : `সরানো আইটেম: ${count}।`),
  notMoved: "সরানো হয়নি।",
  port: (port, node) => `${port} (${node})`,
  linkPort: port => `${port} থেকে সংযোগ করুন`,
  wiring: (from, count) => (count === 1 ? `${from} থেকে তার টানা হচ্ছে। 1টি পোর্ট এটি গ্রহণ করে। বেছে নিতে তীর কী, সংযুক্ত করতে Enter এবং বাতিল করতে Escape চাপুন।` : `${from} থেকে তার টানা হচ্ছে। এটি গ্রহণ করে এমন পোর্ট: ${count}টি। বেছে নিতে তীর কী, সংযুক্ত করতে Enter এবং বাতিল করতে Escape চাপুন।`),
  target: (to, index, count) => `${to}, ${count}টির মধ্যে ${index}।`,
  noTarget: "কোনো পোর্ট এই তার গ্রহণ করে না।",
  connected: (from, to) => `${from} ও ${to} সংযুক্ত হয়েছে।`,
  notConnected: "সংযুক্ত হয়নি।",
} satisfies Catalog<SceneMessages>
