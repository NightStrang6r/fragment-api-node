// Wallets v4r2 and v5r1: state init, address, and the signed external that pays a list of
// messages. Mirrors tonutils/tonweb; checked bit for bit against tonutils (see test/v3).
import { Address, storeAddress } from "./address.js";
import { Builder, Cell, beginCell, cellFromBase64 } from "./cell.js";
import { KeyPair } from "./keys.js";

export type WalletType = "v4r2" | "v5r1";

const CODE: Record<WalletType, string> = {
    v4r2: "b5ee9c72010214010002d4000114ff00f4a413f4bcf2c80b01020120020f020148030602e6d001d0d3032171b0925f04e022d749c120925f04e002d31f218210706c7567bd22821064737472bdb0925f05e003fa403020fa4401c8ca07cbffc9d0ed44d0810140d721f404305c810108f40a6fa131b3925f07e005d33fc8258210706c7567ba923830e30d03821064737472ba925f06e30d0405007801fa00f40430f8276f2230500aa121bef2e0508210706c7567831eb17080185004cb0526cf1658fa0219f400cb6917cb1f5260cb3f20c98040fb0006008a5004810108f45930ed44d0810140d720c801cf16f400c9ed540172b08e23821064737472831eb17080185005cb055003cf1623fa0213cb6acb1fcb3fc98040fb00925f03e2020120070e020120080d020158090a003db29dfb513420405035c87d010c00b23281f2fff274006040423d029be84c600201200b0c0019adce76a26840206b90eb85ffc00019af1df6a26840106b90eb858fc00011b8c97ed44d0d70b1f80059bd242b6f6a2684080a06b90fa0218470d4080847a4937d29910ce6903e9ff9837812801b7810148987159f318404f8f28308d71820d31fd31fd31f02f823bbf264ed44d0d31fd31fd3fff404d15143baf2a15151baf2a205f901541064f910f2a3f80024a4c8cb1f5240cb1f5230cbff5210f400c9ed54f80f01d30721c0009f6c519320d74a96d307d402fb00e830e021c001e30021c002e30001c0039130e30d03a4c8cb1f12cb1fcbff10111213006ed207fa00d4d422f90005c8ca0715cbffc9d077748018c8cb05cb0222cf165005fa0214cb6b12ccccc973fb00c84014810108f451f2a7020070810108d718fa00d33fc8542047810108f451f2a782106e6f746570748018c8cb05cb025006cf165004fa0214cb6a12cb1fcb3fc973fb0002006c810108d718fa00d33f305224810108f459f2a782106473747270748018c8cb05cb025005cf165003fa0213cb6acb1f12cb3fc973fb00000af400c9ed54",
    v5r1: "b5ee9c7201021401000281000114ff00f4a413f4bcf2c80b01020120020d020148030402dcd020d749c120915b8f6320d70b1f2082106578746ebd21821073696e74bdb0925f03e082106578746eba8eb48020d72101d074d721fa4030fa44f828fa443058bd915be0ed44d0810141d721f4058307f40e6fa1319130e18040d721707fdb3ce03120d749810280b99130e070e2100f020120050c020120060902016e07080019adce76a2684020eb90eb85ffc00019af1df6a2684010eb90eb858fc00201480a0b0017b325fb51341c75c875c2c7e00011b262fb513435c280200019be5f0f6a2684080a0eb90fa02c0102f20e011e20d70b1f82107369676ebaf2e08a7f0f01e68ef0eda2edfb218308d722028308d723208020d721d31fd31fd31fed44d0d200d31f20d31fd3ffd70a000af90140ccf9109a28945f0adb31e1f2c087df02b35007b0f2d0845125baf2e0855036baf2e086f823bbf2d0882292f800de01a47fc8ca00cb1f01cf16c9ed542092f80fde70db3cd81003f6eda2edfb02f404216e926c218e4c0221d73930709421c700b38e2d01d72820761e436c20d749c008f2e09320d74ac002f2e09320d71d06c712c2005230b0f2d089d74cd7393001a4e86c128407bbf2e093d74ac000f2e093ed55e2d20001c000915be0ebd72c08142091709601d72c081c12e25210b1e30f20d74a111213009601fa4001fa44f828fa443058baf2e091ed44d0810141d718f405049d7fc8ca0040048307f453f2e08b8e14038307f45bf2e08c22d70a00216e01b3b0f2d090e2c85003cf1612f400c9ed54007230d72c08248e2d21f2e092d200ed44d0d2005113baf2d08f54503091319c01810140d721d70a00f2e08ee2c8ca0058cf16c9ed5493f2c08de20010935bdb31e1d74cd0",
};

export const MAX_MESSAGES: Record<WalletType, number> = { v4r2: 4, v5r1: 255 };
export const V4_SUBWALLET_ID = 698983191;
const MAINNET = -239;
const TESTNET = -3;
const V5_SIGNED_EXTERNAL = 0x7369676e;
const V5_SEND_MSG = 0x0ec3c86d;
export const SEND_MODE = 3; // pay fees separately + ignore errors, as every wallet signs

export function defaultWalletId(type: WalletType, testnet = false): number {
    if (type === "v4r2") return V4_SUBWALLET_ID;
    // client context: 1 bit client flag, workchain 0, version 0, subwallet 0; XOR network id
    const network = (testnet ? TESTNET : MAINNET) >>> 0;
    return ((0x80000000 ^ network) >>> 0);
}

function dataCell(type: WalletType, publicKey: Buffer, testnet: boolean): Cell {
    if (type === "v4r2") {
        return beginCell().storeUint(0, 32).storeUint(V4_SUBWALLET_ID, 32).storeBuffer(publicKey).storeBit(0).endCell();
    }
    return beginCell().storeBit(1).storeUint(0, 32).storeUint(defaultWalletId(type, testnet), 32)
        .storeBuffer(publicKey).storeBit(0).endCell();
}

export function stateInit(type: WalletType, publicKey: Buffer, testnet = false): Cell {
    const code = cellFromBase64(Buffer.from(CODE[type], "hex").toString("base64"));
    // split_depth:none special:none code:^Cell data:^Cell library:empty
    return beginCell().storeBit(0).storeBit(0).storeMaybeRef(code).storeMaybeRef(dataCell(type, publicKey, testnet))
        .storeBit(0).endCell();
}

export function walletAddress(type: WalletType, publicKey: Buffer, testnet = false): Address {
    return new Address(0, stateInit(type, publicKey, testnet).hash(), false, testnet);
}

export interface OutMessage {
    address: string;   // user-friendly: its bounceable flag becomes the message's
    amount: bigint;    // nanotons
    body: Cell;
}

// Message tails as pytoniq/tonutils and @ton/core lay them out: a StateInit or body goes
// inline when it fits in what is left of the cell, in a ref otherwise.
function storeInit(b: Builder, init: Cell | null): void {
    if (!init) {
        b.storeBit(0);
        return;
    }
    b.storeBit(1);
    if (init.bits.length <= 1023 - b.bitLength - 2 && init.refs.length <= 4 - b.refCount) b.storeBit(0).storeCell(init);
    else b.storeBit(1).storeRef(init);
}

function storeBody(b: Builder, body: Cell): void {
    if (body.bits.length <= 1023 - b.bitLength - 1 && body.refs.length <= 4 - b.refCount) b.storeBit(0).storeCell(body);
    else b.storeBit(1).storeRef(body);
}

// int_msg_info with ihr disabled, not bounced, src addr_none, no extra currencies, zero
// fees/lt/at, no StateInit - what TON Connect wallets send.
export function internalMessage(msg: OutMessage): Cell {
    const dest = Address.parse(msg.address);
    const b = beginCell()
        .storeBit(0)                 // int_msg_info$0
        .storeBit(1)                 // ihr_disabled
        .storeBit(dest.bounceable)   // bounce
        .storeBit(0);                // bounced
    storeAddress(b, null);           // src
    storeAddress(b, dest);
    b.storeCoins(msg.amount).storeBit(0)   // value, no extra currencies
        .storeCoins(0).storeCoins(0)       // ihr_fee, fwd_fee
        .storeUint(0, 64).storeUint(0, 32); // created_lt, created_at
    storeInit(b, null);
    storeBody(b, msg.body);
    return b.endCell();
}

export interface SignParams {
    type: WalletType;
    keyPair: KeyPair;
    seqno: number;
    validUntil: number;
    messages: OutMessage[];
    includeStateInit?: boolean;   // wallet not deployed yet: deploy it with this external
    testnet?: boolean;
}

function signingMessage(p: SignParams): Cell {
    const walletId = defaultWalletId(p.type, p.testnet);
    if (p.type === "v4r2") {
        const b = beginCell().storeUint(walletId, 32).storeUint(p.validUntil, 32).storeUint(p.seqno, 32).storeUint(0, 8);
        for (const m of p.messages) b.storeUint(SEND_MODE, 8).storeRef(internalMessage(m));
        return b.endCell();
    }
    let actions = Cell.empty();
    for (const m of p.messages) {
        actions = beginCell().storeRef(actions).storeUint(V5_SEND_MSG, 32).storeUint(SEND_MODE, 8)
            .storeRef(internalMessage(m)).endCell();
    }
    return beginCell().storeUint(V5_SIGNED_EXTERNAL, 32).storeUint(walletId, 32).storeUint(p.validUntil, 32)
        .storeUint(p.seqno, 32).storeBit(1).storeRef(actions).storeBit(0).endCell();
}

export interface SignedExternal {
    boc: string;            // base64, what /v3/orders/submit takes
    normalizedHash: string; // how the chain (and the server) will know it
    cell: Cell;
}

export function signExternal(p: SignParams): SignedExternal {
    if (!p.messages.length) throw new Error("nothing to send");
    if (p.messages.length > MAX_MESSAGES[p.type]) throw new Error(`${p.type} sends at most ${MAX_MESSAGES[p.type]} messages`);
    const unsigned = signingMessage(p);
    const signature = p.keyPair.sign(unsigned.hash());
    const body: Builder = beginCell();
    if (p.type === "v4r2") body.storeBuffer(signature).storeCell(unsigned);
    else body.storeCell(unsigned).storeBuffer(signature);
    const bodyCell = body.endCell();

    const wallet = walletAddress(p.type, p.keyPair.publicKey, p.testnet);
    const ext = beginCell().storeUint(2, 2);  // ext_in_msg_info$10
    storeAddress(ext, null);                  // src
    storeAddress(ext, wallet);
    ext.storeCoins(0);                        // import_fee
    storeInit(ext, p.includeStateInit ? stateInit(p.type, p.keyPair.publicKey, p.testnet) : null);
    storeBody(ext, bodyCell);
    const cell = ext.endCell();

    // TEP-467 normalized hash: src none, no init, zero import fee, body in a ref.
    const norm = beginCell().storeUint(2, 2);
    storeAddress(norm, null);
    storeAddress(norm, wallet);
    norm.storeCoins(0).storeBit(0).storeBit(1).storeRef(bodyCell);
    return { boc: cell.toBase64(), normalizedHash: norm.endCell().hash().toString("hex"), cell };
}
