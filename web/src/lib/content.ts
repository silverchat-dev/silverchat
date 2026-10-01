import { keccak256, stringToBytes, type Hex } from "viem";

import { refused } from "./moderation";

/**
 * Poll content, shared by the browser and the server. Its hash goes on-chain in `ask()`, so the text form is fixed:
 * built by hand in this key order, strings trimmed, nothing else. Like the data field in the book, "an encoding of
 * Gladias's home address, in the correct format according to the standard shopping protocol" (Snowmoon, ch. 16): one
 * form, hashed the same everywhere. Bump `v` before changing any of it.
 */
type Questions = { q: string; options: string[] }[];
export type Content = { v: 1; questions: Questions } | { v: 2; topic: Topic; questions: Questions };

/** v2 adds the topic the asker filed the poll under. v1 polls have none and show under every filter's "All". */
export const TOPICS = ["Crypto", "AI", "Markets", "Politics", "Sports", "Culture", "Science", "Other"] as const;
export type Topic = (typeof TOPICS)[number];

export const topicOf = (content: Content | null) => (content?.v === 2 ? content.topic : null);

export const LIMITS = { questions: 5, options: 6, question: 200, option: 80 };

const len = (s: string) => [...s].length;

/** Returns the clean content, or a short reason it was refused. */
export function parseContent(input: unknown): Content | string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "content must be an object";
  const { v, topic, questions, ...rest } = input as Record<string, unknown>;
  if (Object.keys(rest).length) return `unknown field: ${Object.keys(rest)[0]}`;
  if (v !== 1 && v !== 2) return "v must be 1 or 2";
  if (v === 1 && topic !== undefined) return "unknown field: topic";
  if (v === 2 && !TOPICS.includes(topic as Topic)) return `topic must be one of ${TOPICS.join(", ")}`;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > LIMITS.questions) {
    return `ask 1 to ${LIMITS.questions} questions`;
  }

  const out: Content = v === 2 ? { v: 2, topic: topic as Topic, questions: [] } : { v: 1, questions: [] };
  for (const [i, item] of questions.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return `question ${i + 1} is not an object`;
    const { q, options, ...more } = item as Record<string, unknown>;
    if (Object.keys(more).length) return `question ${i + 1}: unknown field ${Object.keys(more)[0]}`;
    if (typeof q !== "string" || !q.trim()) return `question ${i + 1} is empty`;
    if (len(q.trim()) > LIMITS.question) return `question ${i + 1} is longer than ${LIMITS.question} characters`;
    if (!Array.isArray(options) || options.length < 2 || options.length > LIMITS.options) {
      return `question ${i + 1} needs 2 to ${LIMITS.options} options`;
    }
    const clean: string[] = [];
    for (const o of options) {
      if (typeof o !== "string" || !o.trim()) return `question ${i + 1} has an empty option`;
      if (len(o.trim()) > LIMITS.option) return `question ${i + 1} has an option longer than ${LIMITS.option} characters`;
      if (clean.includes(o.trim())) return `question ${i + 1} repeats an option`;
      clean.push(o.trim());
    }
    out.questions.push({ q: q.trim(), options: clean });
  }
  const word = refused(out);
  if (word) return `Silverchat does not publish questions with "${word}" in them`;
  return out;
}

export function canonical(content: Content): string {
  const questions = content.questions.map(({ q, options }) => ({ q, options }));
  return JSON.stringify(content.v === 2 ? { v: 2, topic: content.topic, questions } : { v: 1, questions });
}

export const contentHash = (text: string): Hex => keccak256(stringToBytes(text));
