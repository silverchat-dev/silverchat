// neither ships types; SilverCash uses one constructor of each
declare module "level-js";
declare module "snarkjs" {
  export const groth16: { fullProve: (inputs: object, wasm: Uint8Array, zkey: Uint8Array) => Promise<{ proof: object; publicSignals: string[] }> };
}
