// A TON wallet key from its mnemonic, kept in this process only. Standard TON derivation
// (tonweb / ton-crypto / tonutils), Ed25519 through node:crypto - no dependency.
import { createHmac, createPrivateKey, createPublicKey, pbkdf2Sync, sign, KeyObject } from "node:crypto";

const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const PBKDF_ITERATIONS = 100000;

export interface KeyPair {
    publicKey: Buffer;
    sign(data: Buffer): Buffer;
}

function words(mnemonic: string | string[]): string[] {
    return (Array.isArray(mnemonic) ? mnemonic.join(" ") : mnemonic).trim().toLowerCase().split(/\s+/);
}

// TON's own checksum: a password-less mnemonic's "basic seed" starts with a zero byte.
// Catches a mistyped word 255 times in 256 before any money is involved.
export function isValidMnemonic(mnemonic: string | string[]): boolean {
    const w = words(mnemonic);
    if (![12, 18, 24].includes(w.length)) return false;
    const entropy = createHmac("sha512", w.join(" ")).update(Buffer.alloc(0)).digest();
    const check = pbkdf2Sync(entropy, "TON seed version", Math.max(1, Math.floor(PBKDF_ITERATIONS / 256)), 64, "sha512");
    return check[0] === 0;
}

export function keyPairFromMnemonic(mnemonic: string | string[], { validate = true } = {}): KeyPair {
    const w = words(mnemonic);
    if (![12, 18, 24].includes(w.length)) throw new Error("mnemonic must have 12, 18 or 24 words");
    if (validate && !isValidMnemonic(w)) throw new Error("mnemonic checksum does not match - check the words");
    const entropy = createHmac("sha512", w.join(" ")).update(Buffer.alloc(0)).digest();
    const seed = pbkdf2Sync(entropy, "TON default seed", PBKDF_ITERATIONS, 64, "sha512");
    return keyPairFromSeed(seed.subarray(0, 32));
}

export function keyPairFromSeed(seed32: Buffer): KeyPair {
    if (seed32.length !== 32) throw new Error("Ed25519 seed must be 32 bytes");
    const privateKey: KeyObject = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed32]), format: "der", type: "pkcs8" });
    const publicKey = (createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer).subarray(-32);
    return {
        publicKey: Buffer.from(publicKey),
        sign: (data: Buffer) => sign(null, data, privateKey),
    };
}
