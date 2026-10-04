/**
 * ZKPassport (Aztec Labs; Noir circuits, Aztec's Barretenberg prover, a verifier on Ethereum mainnet): the phone reads
 * the passport's chip and proves two things about its holder without showing them: 18 or older, and on no sanctions
 * list. It asks nothing about nationality: a passport is not a reason to refuse anyone. The proof is bound to the burner. The SDK checks it in this browser
 * against ZKPassport's verifier on Ethereum, through ZKPassport's own RPC, which so sees the burner's address. Zinc keeps
 * only "verified until" and the per-site identifier ZKPassport derives for scope "zinc": no name, no number.
 */
import type { Hex } from "viem";

const SAVED = "zinc:passport";
const WEEK = 7 * 24 * 3600;

type Pass = { burner: Hex; id: string; until: number };

export const passOf = (burner: Hex): Pass | null => {
  try {
    const p: Pass | null = JSON.parse(localStorage.getItem(SAVED) ?? "null");
    return p && p.burner === burner && p.until > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
};

export const forgetPassport = () => localStorage.removeItem(SAVED);

export type Asking = { url: string; cancel: () => void; result: Promise<Pass> };

/** Start a request: show `url` as a QR for the ZKPassport app; `result` settles when the phone answers. */
export async function askPassport(burner: Hex, onStep: (s: string) => void): Promise<Asking> {
  const { ZKPassport } = await import("@zkpassport/sdk");
  const zk = new ZKPassport(location.hostname);
  const q = await zk.request({
    name: "Zinc",
    purpose: "Unlock larger amounts. Zinc learns no name and no number.",
    scope: "zinc",
    mode: "compressed-evm",
    validity: WEEK,
  });
  const r = q
    .gte("age", 18)
    .sanctions()
    .bind("user_address", burner)
    .done();
  r.onRequestReceived(() => onStep("Request opened on the phone"));
  r.onGeneratingProof(() => onStep("The phone is making the proof"));
  const result = new Promise<Pass>((ok, fail) => {
    r.onReject(() => fail(new Error("declined on the phone")));
    r.onError((e) => fail(new Error(e)));
    // onResult's verdict is computed in this page; with no server behind Zinc there is nothing better to check it against
    r.onResult(({ verified, uniqueIdentifier }) => {
      if (!verified || !uniqueIdentifier) return fail(new Error("the proof did not verify"));
      const pass = { burner, id: uniqueIdentifier, until: Math.floor(Date.now() / 1000) + WEEK };
      localStorage.setItem(SAVED, JSON.stringify(pass));
      ok(pass);
    });
  });
  return { url: r.url, cancel: () => zk.cancelRequest(r.requestId), result };
}
