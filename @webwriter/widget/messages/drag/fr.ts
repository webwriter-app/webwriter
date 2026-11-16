import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} saisi. Utilisez les flèches pour choisir un emplacement, Entrée pour déposer, Échap pour annuler.`,
  pickedLink: item => `Liaison de ${item}. Utilisez les flèches pour choisir la cible de la liaison, Entrée pour relier, Échap pour annuler.`,
  selected: item => `${item} sélectionné. Cliquez à l’endroit voulu, ou cliquez de nouveau sur l’élément pour annuler.`,
  nextTarget: "La touche Tab passe à la cible suivante.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}position ${position.index} sur ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} depuis la gauche, ${y} depuis le haut`,
  dropped: (item, target) => (target ? `${item} déposé sur ${target}.` : `${item} déposé.`),
  copied: (item, target) => (target ? `${item} ajouté à ${target}.` : `${item} ajouté.`),
  linked: (item, target) => `${item} relié à ${target}.`,
  cancelled: () => "Annulé.",
  notAllowed: "Annulé. Ce n’est plus autorisé ici.",
} satisfies Catalog<DragMessages>
