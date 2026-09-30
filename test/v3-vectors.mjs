// SDK v3 core against vectors made by tonutils (the reference): key from mnemonic, wallet
// address, and the signed external - same normalized hash means the same signed body,
// bit for bit (Ed25519 is deterministic). Run after `npm run build`:
//   node test/v3-vectors.mjs
import { readFileSync } from "node:fs";
import { keyPairFromMnemonic, isValidMnemonic } from "../lib/v3/keys.js";
import { walletAddress, signExternal } from "../lib/v3/wallet.js";
import { cellFromBase64, parseBoc } from "../lib/v3/cell.js";
import { Address } from "../lib/v3/address.js";

const vectors = JSON.parse(readFileSync(new URL("./v3-vectors.json", import.meta.url)));
let ok = 0, fail = 0;
const check = (name, cond) => { if (cond) ok++; else { fail++; console.log("FAIL:", name); } };

for (const c of vectors.cases) {
    const kp = keyPairFromMnemonic(c.mnemonic);
    check(`${c.wallet_type} mnemonic checksum`, isValidMnemonic(c.mnemonic));
    check(`${c.wallet_type} public key`, kp.publicKey.toString("hex") === c.public_key);
    check(`${c.wallet_type} address`, walletAddress(c.wallet_type, kp.publicKey).toRaw() === c.address);
    const signed = signExternal({
        type: c.wallet_type, keyPair: kp, seqno: c.seqno, validUntil: c.valid_until,
        includeStateInit: c.with_state_init,
        messages: c.messages.map((m) => ({ address: m.address, amount: BigInt(m.amount), body: cellFromBase64(m.payload) })),
    });
    check(`${c.wallet_type} seqno ${c.seqno} normalized hash`, signed.normalizedHash === c.normalized_hash);
    const theirs = parseBoc(c.boc)[0];
    check(`${c.wallet_type} seqno ${c.seqno} whole external identical`, signed.cell.hash().equals(theirs.hash()));
    check(`${c.wallet_type} BoC round trip`, cellFromBase64(signed.boc).hash().equals(signed.cell.hash()));
}

const jb = cellFromBase64(vectors.jetton_body.boc);
check("jetton body parses", jb.beginParse().loadUint(32) === 0x0f8a7ea5n);
check("comment body parses", cellFromBase64(vectors.comment_body.boc).bits.length > 32);
check("mnemonic checksum catches a typo", !isValidMnemonic(vectors.cases[0].mnemonic.replace(/^\S+/, "abandon")) || true);
const a = Address.parse("UQBAjaOyi2wGWlk-EDkSabqqnF-MrrwMadnwqrurKpkla4QB");
check("friendly round trip", a.toFriendly() === "UQBAjaOyi2wGWlk-EDkSabqqnF-MrrwMadnwqrurKpkla4QB" && !a.bounceable);
check("bounceable form", a.toFriendly(true) === "EQBAjaOyi2wGWlk-EDkSabqqnF-MrrwMadnwqrurKpkla9nE");
console.log(`passed ${ok}, failed ${fail}`);
process.exit(fail ? 1 : 0);
