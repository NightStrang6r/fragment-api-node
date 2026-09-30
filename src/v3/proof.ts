// TON Connect ton_proof (v2): how the SDK proves to /v3/auth that it holds the wallet key.
import { createHash } from "node:crypto";
import { Address } from "./address.js";
import { KeyPair } from "./keys.js";

export function cookiesPayload(fragmentCookies?: string | null): string {
    const digest = fragmentCookies ? createHash("sha256").update(fragmentCookies, "utf8").digest("hex") : "";
    return "fragment-api/v3:" + digest;
}

export function tonProofSignature(keyPair: KeyPair, wallet: Address, domain: string, timestamp: number, payload: string): Buffer {
    const wc = Buffer.alloc(4);
    wc.writeInt32BE(wallet.workchain);
    const domainBytes = Buffer.from(domain, "utf8");
    const domainLen = Buffer.alloc(4);
    domainLen.writeUInt32LE(domainBytes.length);
    const ts = Buffer.alloc(8);
    ts.writeBigUInt64LE(BigInt(timestamp));
    const message = Buffer.concat([Buffer.from("ton-proof-item-v2/", "utf8"), wc, wallet.hash, domainLen, domainBytes, ts,
        Buffer.from(payload, "utf8")]);
    const inner = createHash("sha256").update(message).digest();
    const digest = createHash("sha256").update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from("ton-connect", "utf8"), inner])).digest();
    return keyPair.sign(digest);
}
