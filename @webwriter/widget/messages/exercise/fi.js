var fi_default = {
  check: "Tarkista",
  reset: "Nollaa",
  showSolution: "Näytä ratkaisu",
  hideSolution: "Piilota ratkaisu",
  required: "Vastaa tähän kysymykseen.",
  summary: (correct, total) => correct === total ? "Kaikki on oikein." : `Oikein: ${correct}, yhteensä ${total}.`,
  feedbackOption: "Palaute",
  feedbackOnCheck: "Kun lukija tarkistaa",
  feedbackOnSubmit: "Lähettämisen jälkeen",
  requiredOption: "Pakollinen"
};
export {
  fi_default as default
};
