// Railgun's groth16 proofs, off the page's thread: the engine posts the inputs and the circuit files, this answers.
import { groth16 } from "snarkjs";

self.onmessage = async (e: MessageEvent<{ id: number; inputs: object; wasm: Uint8Array; zkey: Uint8Array }>) => {
  const { id, inputs, wasm, zkey } = e.data;
  try {
    const result = await groth16.fullProve(inputs as never, wasm, zkey);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
