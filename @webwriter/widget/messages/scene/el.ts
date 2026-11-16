import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Η επιλογή καταργήθηκε." : count === 1 ? "Επιλέχθηκε 1 στοιχείο." : `Επιλέχθηκαν ${count} στοιχεία.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Μετακινήθηκε." : `Μετακινήθηκαν ${count} στοιχεία.`),
  notMoved: "Δεν μετακινήθηκε.",
  port: (port, node) => `${port} του στοιχείου «${node}»`,
  linkPort: port => `Σύνδεση από «${port}»`,
  wiring: (from, count) => (count === 1 ? `Σύνδεση από «${from}». Τη δέχεται 1 θύρα. Τα πλήκτρα βελών επιλέγουν, το Enter συνδέει, το Escape ακυρώνει.` : `Σύνδεση από «${from}». Τη δέχονται ${count} θύρες. Τα πλήκτρα βελών επιλέγουν, το Enter συνδέει, το Escape ακυρώνει.`),
  target: (to, index, count) => `${to}, ${index} από ${count}.`,
  noTarget: "Καμία θύρα δεν δέχεται αυτή τη σύνδεση.",
  connected: (from, to) => `Το «${from}» συνδέθηκε με το «${to}».`,
  notConnected: "Δεν συνδέθηκε.",
} satisfies Catalog<SceneMessages>
