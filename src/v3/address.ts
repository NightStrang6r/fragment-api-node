// TON addresses: raw "0:<hex>" and user-friendly base64 (flags, workchain, hash, CRC16).
import { Builder, Slice } from "./cell.js";

const BOUNCEABLE = 0x11;
const NON_BOUNCEABLE = 0x51;
const TEST_FLAG = 0x80;

function crc16(data: Buffer): number {
    let crc = 0;
    for (const byte of data) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
}

export class Address {
    constructor(readonly workchain: number, readonly hash: Buffer, readonly bounceable = true, readonly testOnly = false) {
        if (hash.length !== 32) throw new Error("address hash must be 32 bytes");
    }

    static parse(value: string): Address {
        if (/^-?\d+:[0-9a-fA-F]{64}$/.test(value)) {
            const [wc, hex] = value.split(":");
            return new Address(Number(wc), Buffer.from(hex, "hex"));
        }
        const raw = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
        if (raw.length !== 36) throw new Error(`not a TON address: ${value}`);
        if (crc16(raw.subarray(0, 34)) !== raw.readUInt16BE(34)) throw new Error(`bad address checksum: ${value}`);
        const tag = raw[0];
        const test = (tag & TEST_FLAG) !== 0;
        const base = tag & ~TEST_FLAG;
        if (base !== BOUNCEABLE && base !== NON_BOUNCEABLE) throw new Error(`bad address tag: ${value}`);
        const wc = raw[1] > 127 ? raw[1] - 256 : raw[1];
        return new Address(wc, raw.subarray(2, 34), base === BOUNCEABLE, test);
    }

    toRaw(): string {
        return `${this.workchain}:${this.hash.toString("hex")}`;
    }

    toFriendly(bounceable = this.bounceable, testOnly = this.testOnly): string {
        const body = Buffer.concat([
            Buffer.from([(bounceable ? BOUNCEABLE : NON_BOUNCEABLE) | (testOnly ? TEST_FLAG : 0), this.workchain & 0xff]),
            this.hash,
        ]);
        const crc = Buffer.alloc(2);
        crc.writeUInt16BE(crc16(body));
        return Buffer.concat([body, crc]).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    }

    equals(other: Address): boolean {
        return this.workchain === other.workchain && this.hash.equals(other.hash);
    }
}

export function sameAddress(a: string, b: string): boolean {
    return Address.parse(a).equals(Address.parse(b));
}

// addr_std$10 anycast:nothing workchain:int8 address:bits256; addr_none$00 for null.
export function storeAddress(b: Builder, address: Address | null): Builder {
    if (!address) return b.storeUint(0, 2);
    return b.storeUint(2, 2).storeBit(0).storeInt(address.workchain, 8).storeBuffer(address.hash);
}

export function loadAddress(s: Slice): Address | null {
    const tag = Number(s.loadUint(2));
    if (tag === 0) return null;
    if (tag !== 2) throw new Error("only standard addresses are supported");
    if (s.loadBit()) throw new Error("anycast addresses are not supported");
    const wc = Number(s.loadInt(8));
    return new Address(wc, s.loadBuffer(32));
}
