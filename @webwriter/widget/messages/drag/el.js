var el_default = {
  picked: (item) => `Το στοιχείο «${item}» πάρθηκε. Χρησιμοποιήστε τα πλήκτρα βελών για να επιλέξετε θέση, το Enter για να το αφήσετε και το Escape για ακύρωση.`,
  pickedLink: (item) => `Σύνδεση του στοιχείου «${item}». Χρησιμοποιήστε τα πλήκτρα βελών για να επιλέξετε προορισμό, το Enter για σύνδεση και το Escape για ακύρωση.`,
  selected: (item) => `Το στοιχείο «${item}» επιλέχθηκε. Κάντε κλικ στο σημείο όπου πρέπει να πάει ή κάντε ξανά κλικ σε αυτό για ακύρωση.`,
  nextTarget: "Το Tab μεταβαίνει στον επόμενο προορισμό.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}θέση ${position.index} από ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} από αριστερά, ${y} από πάνω`,
  dropped: (item, target) => target ? `Το στοιχείο «${item}» αφέθηκε στον προορισμό «${target}».` : `Το στοιχείο «${item}» αφέθηκε.`,
  copied: (item, target) => target ? `Το στοιχείο «${item}» προστέθηκε στον προορισμό «${target}».` : `Το στοιχείο «${item}» προστέθηκε.`,
  linked: (item, target) => `Το στοιχείο «${item}» συνδέθηκε με τον προορισμό «${target}».`,
  cancelled: () => "Ακυρώθηκε.",
  notAllowed: "Ακυρώθηκε. Αυτό δεν επιτρέπεται πλέον εδώ."
};
export {
  el_default as default
};
