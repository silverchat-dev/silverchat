/** The sample poll the landing page develops. Shown with an "Example" label until real polls exist. */
export const EXAMPLE = {
  question: "Will ETH be above $5,000 before January?",
  options: [
    { label: "Yes", share: 63 },
    { label: "No", share: 37 },
  ],
  answers: 9481,
  zc: 18_400,
};

/** Sample negatives for the strip beside the tray. */
export const EXAMPLE_NEGATIVES = [
  { block: 26_071_901, question: "Will base fees be lower a month from now?", yes: 28 },
  { block: 26_071_900, question: "Is decentralization still winning?", yes: 67 },
  { block: 26_071_899, question: "Will ZC reach 1,000 holders this week?", yes: 41 },
  { block: 26_071_898, question: "Would you trust a jury drawn at random?", yes: 46 },
];
