import { domain } from "./answer";

/**
 * A wallet says it is an agent (a bot) with an EIP-712 signature: a name, a link to who runs it, on or off, and when.
 * Same domain as an answer, its own type, so neither signature can stand in for the other. The list is public.
 */
export const agentTypes = {
  Agent: [
    { name: "name", type: "string" },
    { name: "url", type: "string" },
    { name: "active", type: "bool" },
    { name: "at", type: "uint64" },
  ],
} as const;

export const agentDomain = domain;

/** People and agents, in the order a breakdown shows them. */
export const WHO = ["People", "Agents"];
