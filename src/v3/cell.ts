// TON cells, just enough to build, hash, serialize and parse the messages API v3 needs.
// Ordinary cells only. Checked bit for bit against tonutils (see test/v3).
import { createHash } from "node:crypto";

export const MAX_BITS = 1023;
export const MAX_REFS = 4;

export class Cell {
    private cachedHash?: Buffer;
    private cachedDepth?: number;

    constructor(readonly bits: readonly number[], readonly refs: readonly Cell[] = []) {
        if (bits.length > MAX_BITS) throw new Error(`cell overflow: ${bits.length} bits`);
        if (refs.length > MAX_REFS) throw new Error(`cell overflow: ${refs.length} refs`);
    }

    static empty(): Cell {
        return new Cell([], []);
    }

    beginParse(): Slice {
        return new Slice(this);
    }

    depth(): number {
        if (this.cachedDepth === undefined) {
            this.cachedDepth = this.refs.length ? 1 + Math.max(...this.refs.map((r) => r.depth())) : 0;
        }
        return this.cachedDepth;
    }

    descriptors(): [number, number] {
        const full = Math.floor(this.bits.length / 8);
        return [this.refs.length, full + Math.ceil(this.bits.length / 8)];
    }

    // Data bytes with the completion tag: a 1 bit, then zeros, when not byte-aligned.
    dataBytes(): Buffer {
        const padded = [...this.bits];
        if (padded.length % 8) {
            padded.push(1);
            while (padded.length % 8) padded.push(0);
        }
        return bitsToBuffer(padded);
    }

    hash(): Buffer {
        if (!this.cachedHash) {
            const [d1, d2] = this.descriptors();
            const parts: Buffer[] = [Buffer.from([d1, d2]), this.dataBytes()];
            for (const r of this.refs) {
                const depth = Buffer.alloc(2);
                depth.writeUInt16BE(r.depth());
                parts.push(depth);
            }
            for (const r of this.refs) parts.push(r.hash());
            this.cachedHash = createHash("sha256").update(Buffer.concat(parts)).digest();
        }
        return this.cachedHash;
    }

    toBoc(): Buffer {
        return serializeBoc(this);
    }

    toBase64(): string {
        return this.toBoc().toString("base64");
    }
}

// A library cell (exotic, type 2): code published on chain, referenced by its hash. Only
// hashed here, never serialized - USDT's jetton wallet code is one (payment.ts).
class LibraryCell extends Cell {
    descriptors(): [number, number] {
        return [8, 66];   // no refs, exotic, level 0; 264 data bits
    }
}

export function libraryCell(codeHash: Buffer): Cell {
    if (codeHash.length !== 32) throw new Error("a library cell holds a 32-byte hash");
    return new LibraryCell(beginCell().storeUint(2, 8).storeBuffer(codeHash).endCell().bits);
}

export function bitsToBuffer(bits: readonly number[]): Buffer {
    const out = Buffer.alloc(Math.ceil(bits.length / 8));
    bits.forEach((b, i) => {
        if (b) out[i >> 3] |= 0x80 >> (i & 7);
    });
    return out;
}

function bufferToBits(buf: Buffer, bitLength: number): number[] {
    const bits: number[] = [];
    for (let i = 0; i < bitLength; i++) bits.push((buf[i >> 3] >> (7 - (i & 7))) & 1);
    return bits;
}

export class Builder {
    private bits: number[] = [];
    private refs: Cell[] = [];

    storeBit(bit: boolean | number): this {
        this.bits.push(bit ? 1 : 0);
        return this;
    }

    storeBits(bits: readonly number[]): this {
        for (const b of bits) this.storeBit(b);
        return this;
    }

    storeUint(value: bigint | number, bitLength: number): this {
        let v = BigInt(value);
        if (v < 0n || v >= 1n << BigInt(bitLength)) throw new Error(`uint${bitLength} out of range: ${v}`);
        for (let i = bitLength - 1; i >= 0; i--) this.bits.push(Number((v >> BigInt(i)) & 1n));
        return this;
    }

    storeInt(value: bigint | number, bitLength: number): this {
        let v = BigInt(value);
        const limit = 1n << BigInt(bitLength - 1);
        if (v < -limit || v >= limit) throw new Error(`int${bitLength} out of range: ${v}`);
        if (v < 0n) v += 1n << BigInt(bitLength);
        return this.storeUint(v, bitLength);
    }

    storeBuffer(buf: Buffer | Uint8Array): this {
        for (const byte of buf) this.storeUint(byte, 8);
        return this;
    }

    // VarUInteger 16: a 4-bit byte length, then the value.
    storeCoins(amount: bigint | number): this {
        const v = BigInt(amount);
        if (v < 0n) throw new Error("coins can not be negative");
        if (v === 0n) return this.storeUint(0, 4);
        const bytes = Math.ceil(v.toString(16).length / 2);
        if (bytes > 15) throw new Error("coins out of range");
        return this.storeUint(bytes, 4).storeUint(v, bytes * 8);
    }

    storeRef(cell: Cell): this {
        if (this.refs.length >= MAX_REFS) throw new Error("too many refs");
        this.refs.push(cell);
        return this;
    }

    storeMaybeRef(cell: Cell | null | undefined): this {
        if (!cell) return this.storeBit(0);
        return this.storeBit(1).storeRef(cell);
    }

    // Everything a finished cell holds: its bits and its refs.
    storeCell(cell: Cell): this {
        this.storeBits(cell.bits);
        for (const r of cell.refs) this.storeRef(r);
        return this;
    }

    get bitLength(): number {
        return this.bits.length;
    }

    get refCount(): number {
        return this.refs.length;
    }

    endCell(): Cell {
        return new Cell([...this.bits], [...this.refs]);
    }
}

export function beginCell(): Builder {
    return new Builder();
}

export class Slice {
    private bitPos = 0;
    private refPos = 0;

    constructor(private readonly cell: Cell) {}

    get remainingBits(): number {
        return this.cell.bits.length - this.bitPos;
    }

    get remainingRefs(): number {
        return this.cell.refs.length - this.refPos;
    }

    loadBit(): number {
        if (this.remainingBits < 1) throw new Error("slice underflow");
        return this.cell.bits[this.bitPos++];
    }

    loadBits(n: number): number[] {
        if (this.remainingBits < n) throw new Error("slice underflow");
        const out = this.cell.bits.slice(this.bitPos, this.bitPos + n);
        this.bitPos += n;
        return [...out];
    }

    loadUint(n: number): bigint {
        let v = 0n;
        for (const b of this.loadBits(n)) v = (v << 1n) | BigInt(b);
        return v;
    }

    loadInt(n: number): bigint {
        const v = this.loadUint(n);
        return v >= 1n << BigInt(n - 1) ? v - (1n << BigInt(n)) : v;
    }

    loadBuffer(bytes: number): Buffer {
        return bitsToBuffer(this.loadBits(bytes * 8));
    }

    loadCoins(): bigint {
        const len = Number(this.loadUint(4));
        return len === 0 ? 0n : this.loadUint(len * 8);
    }

    loadRef(): Cell {
        if (this.remainingRefs < 1) throw new Error("no more refs");
        return this.cell.refs[this.refPos++];
    }

    loadMaybeRef(): Cell | null {
        return this.loadBit() ? this.loadRef() : null;
    }
}

// --- bags of cells ------------------------------------------------------------------

const BOC_MAGIC = 0xb5ee9c72;

function bytesFor(n: number): number {
    let bytes = 1;
    while (n >= 2 ** (8 * bytes)) bytes++;
    return bytes;
}

function writeUintBE(value: number, bytes: number): Buffer {
    const out = Buffer.alloc(bytes);
    for (let i = bytes - 1; i >= 0; i--) {
        out[i] = value & 0xff;
        value = Math.floor(value / 256);
    }
    return out;
}

// Serialize one root: parents before children, identical cells stored once, no index,
// no CRC (both optional in the format and accepted by lite-servers and tonapi).
export function serializeBoc(root: Cell): Buffer {
    const order: Cell[] = [];
    const index = new Map<string, number>();
    const visit = (cell: Cell) => {
        const key = cell.hash().toString("hex");
        if (index.has(key)) return;
        index.set(key, order.length);
        order.push(cell);
        cell.refs.forEach(visit);
    };
    visit(root);
    // Topological fix-up: every ref must point to a later cell.
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < order.length; i++) {
            for (const r of order[i].refs) {
                const j = index.get(r.hash().toString("hex"))!;
                if (j < i) {
                    const [moved] = order.splice(j, 1);
                    order.splice(i, 0, moved);
                    order.forEach((c, k) => index.set(c.hash().toString("hex"), k));
                    changed = true;
                }
            }
        }
    }
    const sizeBytes = bytesFor(order.length);
    const cells = order.map((cell) => {
        const [d1, d2] = cell.descriptors();
        const refs = cell.refs.map((r) => writeUintBE(index.get(r.hash().toString("hex"))!, sizeBytes));
        return Buffer.concat([Buffer.from([d1, d2]), cell.dataBytes(), ...refs]);
    });
    const data = Buffer.concat(cells);
    const offBytes = bytesFor(data.length);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(BOC_MAGIC);
    return Buffer.concat([
        header,
        Buffer.from([sizeBytes, offBytes]),
        writeUintBE(order.length, sizeBytes),
        writeUintBE(1, sizeBytes),
        writeUintBE(0, sizeBytes),
        writeUintBE(data.length, offBytes),
        writeUintBE(0, sizeBytes),
        data,
    ]);
}

function readUintBE(buf: Buffer, pos: number, bytes: number): number {
    let v = 0;
    for (let i = 0; i < bytes; i++) v = v * 256 + buf[pos + i];
    return v;
}

// Parse a standard BoC (with or without index/CRC); returns its root cells.
export function parseBoc(input: Buffer | string): Cell[] {
    const buf = typeof input === "string" ? Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64") : input;
    if (buf.length < 6 || buf.readUInt32BE(0) !== BOC_MAGIC) throw new Error("not a BoC");
    const flags = buf[4];
    const hasIdx = (flags & 0x80) !== 0;
    const hasCrc = (flags & 0x40) !== 0;
    const sizeBytes = flags & 0x07;
    const offBytes = buf[5];
    let pos = 6;
    const cellCount = readUintBE(buf, pos, sizeBytes); pos += sizeBytes;
    const rootCount = readUintBE(buf, pos, sizeBytes); pos += sizeBytes;
    pos += sizeBytes; // absent
    const totalSize = readUintBE(buf, pos, offBytes); pos += offBytes;
    const roots: number[] = [];
    for (let i = 0; i < rootCount; i++) { roots.push(readUintBE(buf, pos, sizeBytes)); pos += sizeBytes; }
    if (hasIdx) pos += cellCount * offBytes;
    const end = pos + totalSize;
    if (end + (hasCrc ? 4 : 0) > buf.length) throw new Error("truncated BoC");

    const raw: { bits: number[]; refs: number[] }[] = [];
    while (pos < end) {
        const d1 = buf[pos], d2 = buf[pos + 1];
        pos += 2;
        if (d1 & 0x08) throw new Error("exotic cells are not supported");
        if (d1 & 0x10) throw new Error("cells with stored hashes are not supported");
        const refCount = d1 & 0x07;
        const dataLen = Math.ceil(d2 / 2);
        const data = buf.subarray(pos, pos + dataLen);
        pos += dataLen;
        let bitLen = dataLen * 8;
        if (d2 % 2) {
            // Strip the completion tag: trailing zeros, then the 1.
            while (bitLen > 0 && !((data[(bitLen - 1) >> 3] >> (7 - ((bitLen - 1) & 7))) & 1)) bitLen--;
            bitLen--;
        }
        const refs: number[] = [];
        for (let i = 0; i < refCount; i++) { refs.push(readUintBE(buf, pos, sizeBytes)); pos += sizeBytes; }
        raw.push({ bits: bufferToBits(data, bitLen), refs });
    }
    if (raw.length !== cellCount) throw new Error("BoC cell count mismatch");
    const built: Cell[] = new Array(raw.length);
    for (let i = raw.length - 1; i >= 0; i--) {
        built[i] = new Cell(raw[i].bits, raw[i].refs.map((r) => {
            if (r <= i || !built[r]) throw new Error("BoC refs are not in topological order");
            return built[r];
        }));
    }
    return roots.map((r) => built[r]);
}

export function cellFromBase64(value: string): Cell {
    const roots = parseBoc(value);
    if (roots.length !== 1) throw new Error("expected exactly one root cell");
    return roots[0];
}
