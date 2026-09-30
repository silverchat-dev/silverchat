/** The sample poll the landing page develops. Shown with an "Example" label until real polls exist. */
export const EXAMPLE = {
  question: "Will ETH be above $5,000 before January?",
  options: [
    { label: "Yes", share: 63 },
    { label: "No", share: 37 },
  ],
  answers: 9481,
};

/** Sample negatives for the strip beside the tray. */
export const EXAMPLE_NEGATIVES = [
  { block: 26_071_901, question: "Base fees lower next month?", yes: 28 },
  { block: 26_071_900, question: "Decentralization winning?", yes: 67 },
  { block: 26_071_899, question: "ZC past 1,000 holders?", yes: 41 },
  { block: 26_071_898, question: "Trust a jury drawn at random?", yes: 46 },
];
