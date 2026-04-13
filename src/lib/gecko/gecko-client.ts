/**
 * Pure TypeScript Gecko in.Touch 2 UDP client.
 *
 * Re-implements the geckolib protocol using Node.js dgram (UDP sockets).
 * No Python, no child processes.
 *
 * Protocol reverse-engineered from geckolib (https://github.com/gazoodle/geckolib).
 * Communication uses custom XML-like PACKT framing over UDP port 10022.
 */

import dgram from "node:dgram";
import net from "node:net";
import { networkInterfaces } from "node:os";
import packsData from "./packs.json";

// ── Constants ────────────────────────────────────────────────────

const INTOUCH2_PORT = 10022;
const MESSAGE_ENCODING = "latin1" as const;
const PROTOCOL_TIMEOUT_MS = 4_000;
const DISCOVERY_TIMEOUT_MS = 8_000;
const CONNECTION_TIMEOUT_MS = 45_000; // geckolib uses 45s

/** Generate a geckolib-compatible client identifier: IOS<uuid> */
function generateClientId(): string {
  // geckolib format: "IOS" + UUID v4 (e.g. "IOSa2d936db-4e95-4e4d-82bc-b4225fa99739")
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  return `IOS${uuid}`;
}

// ── PACKT framing ────────────────────────────────────────────────

function buildPacket(src: string, dest: string, data: Buffer): Buffer {
  const srcBuf = Buffer.from(src, MESSAGE_ENCODING);
  const destBuf = Buffer.from(dest, MESSAGE_ENCODING);
  return Buffer.concat([
    Buffer.from("<PACKT>"),
    Buffer.from("<SRCCN>"),
    srcBuf,
    Buffer.from("</SRCCN>"),
    Buffer.from("<DESCN>"),
    destBuf,
    Buffer.from("</DESCN>"),
    Buffer.from("<DATAS>"),
    data,
    Buffer.from("</DATAS>"),
    Buffer.from("</PACKT>"),
  ]);
}

function parsePacket(buf: Buffer): {
  src: string;
  dest: string;
  data: Buffer;
} | null {
  const str = buf.toString(MESSAGE_ENCODING);
  const srcMatch = str.match(/<SRCCN>([\s\S]*?)<\/SRCCN>/);
  const destMatch = str.match(/<DESCN>([\s\S]*?)<\/DESCN>/);
  const dataMatch = str.match(/<DATAS>([\s\S]*?)<\/DATAS>/);
  if (!srcMatch || !destMatch || !dataMatch) return null;
  return {
    src: srcMatch[1],
    dest: destMatch[1],
    data: Buffer.from(dataMatch[1], MESSAGE_ENCODING),
  };
}

// ── Protocol message helpers ─────────────────────────────────────

function wrapXml(tag: string, content: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`<${tag}>`),
    content,
    Buffer.from(`</${tag}>`),
  ]);
}

function unwrapXml(
  tag: string,
  buf: Buffer
): Buffer | null {
  const str = buf.toString(MESSAGE_ENCODING);
  const match = str.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!match) return null;
  return Buffer.from(match[1], MESSAGE_ENCODING);
}

// ── Sequence counter ─────────────────────────────────────────────

class SequenceCounter {
  private seq = 1;
  next(): number {
    const val = this.seq;
    this.seq = this.seq >= 191 ? 1 : this.seq + 1;
    return val;
  }
}

// ── UDP transport ────────────────────────────────────────────────

type MessageHandler = (data: Buffer, rinfo: dgram.RemoteInfo) => void;

class UdpTransport {
  private socket: dgram.Socket | null = null;
  private handlers: MessageHandler[] = [];
  private bound = false;

  async open(): Promise<void> {
    if (this.socket) return;
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.socket.on("message", (msg, rinfo) => {
      for (const h of this.handlers) h(msg, rinfo);
    });
    await new Promise<void>((resolve, reject) => {
      this.socket!.bind(0, () => {
        this.socket!.setBroadcast(true);
        this.bound = true;
        resolve();
      });
      this.socket!.on("error", reject);
    });
  }

  addHandler(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  removeHandler(handler: MessageHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  send(buf: Buffer, port: number, address: string): void {
    if (!this.socket || !this.bound) throw new Error("Socket not open");
    this.socket.send(buf, 0, buf.length, port, address);
  }

  close(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
      this.bound = false;
      this.handlers = [];
    }
  }
}

// ── Protocol exchange helper ─────────────────────────────────────

async function exchange(
  transport: UdpTransport,
  request: Buffer,
  port: number,
  address: string,
  matchVerb: string,
  timeoutMs: number = PROTOCOL_TIMEOUT_MS,
  retries: number = 3
): Promise<{ data: Buffer; rinfo: dgram.RemoteInfo }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await new Promise<{
      data: Buffer;
      rinfo: dgram.RemoteInfo;
    } | null>((resolve) => {
      const timer = setTimeout(() => {
        transport.removeHandler(handler);
        resolve(null);
      }, timeoutMs);

      const handler: MessageHandler = (msg, rinfo) => {
        const parsed = parsePacket(msg);
        if (!parsed) return;
        const verb = parsed.data.subarray(0, 5).toString(MESSAGE_ENCODING);
        if (verb === matchVerb || parsed.data.toString(MESSAGE_ENCODING).includes(`<${matchVerb}>`)) {
          clearTimeout(timer);
          transport.removeHandler(handler);
          resolve({ data: parsed.data, rinfo });
        }
      };

      transport.addHandler(handler);
      transport.send(request, port, address);
    });

    if (result) return result;
  }
  throw new Error(`Protocol timeout waiting for ${matchVerb}`);
}

// ── Discovery ────────────────────────────────────────────────────

export type DiscoveredSpa = {
  spaId: string;
  spaName: string;
  address: string;
};

export async function discoverSpas(
  targetAddress?: string
): Promise<DiscoveredSpa[]> {
  const transport = new UdpTransport();
  await transport.open();

  try {
    // Discovery HELLO is sent BARE (no PACKT wrapping!) per geckolib protocol.
    // The spa only recognizes raw <HELLO>1</HELLO> for discovery.
    const bareHello = Buffer.from("<HELLO>1</HELLO>", MESSAGE_ENCODING);

    const spas: DiscoveredSpa[] = [];
    const broadcastAddr = targetAddress ?? "255.255.255.255";

    const handler: MessageHandler = (msg, rinfo) => {
      // Discovery responses are also bare <HELLO>{id}|{name}</HELLO>
      const str = msg.toString(MESSAGE_ENCODING);
      const match = str.match(/<HELLO>([\s\S]*?)<\/HELLO>/);
      if (!match) return;
      const content = match[1];
      // Skip our own broadcasts and other client hellos
      if (content === "1" || content.startsWith("IOS") || content.startsWith("AND"))
        return;

      const parts = content.split("|");
      const spaId = parts[0];
      const spaName = parts.length > 1 ? parts[1] : "Unnamed SPA";
      // Deduplicate
      if (!spas.some((s) => s.spaId === spaId)) {
        spas.push({ spaId, spaName, address: rinfo.address });
      }
    };

    transport.addHandler(handler);

    // Send discovery broadcast 3 times over a few seconds
    for (let i = 0; i < 3; i++) {
      transport.send(bareHello, INTOUCH2_PORT, broadcastAddr);
      await sleep(1500);
    }

    // Wait for remaining responses
    await sleep(DISCOVERY_TIMEOUT_MS - 4500);
    transport.removeHandler(handler);
    return spas;
  } finally {
    transport.close();
  }
}

// ── Connection & state reading ───────────────────────────────────

export type SpaReading = {
  spaName: string;
  spaId: string;
  temperature: number | null;
  setPoint: number | null;
  heatingStatus: string | null;
  minTemp: number | null;
  maxTemp: number | null;
  tempUnit: string | null;
  pumps: { id: string; active: boolean; mode: string | null }[];
  circulationPump: { active: boolean } | null;
  ozone: { active: boolean } | null;
  waterfall: { active: boolean } | null;
  lights: { id: string; active: boolean }[];
  econActive: boolean;
  quietState: string | null; // "NOT_SET" | "DRAIN" | "SOAK" | "OFF"
  lockMode: string | null; // "UNLOCK" | "PARTIAL" | "FULL"
  masterHeater: { active: boolean } | null;
  slaveHeater: { active: boolean } | null;
  watercare: string | null;
  reminders: { type: string; daysRemaining: number }[];
  errors: string[];
};

export const WATERCARE_MODES = [
  "Away From Home",
  "Standard",
  "Energy Saving",
  "Super Energy Saving",
  "Weekender",
] as const;

export type WatercareMode = typeof WATERCARE_MODES[number];

export const REMINDER_TYPES: Record<number, string> = {
  1: "Filter spülen",
  2: "Filter reinigen",
  3: "Wasser wechseln",
  4: "Spa prüfen",
  5: "Ozonator wechseln",
  6: "Vision-Kartusche wechseln",
};

// ── Cached connection info ──────────────────────────────────────
// Avoid re-doing full HELLO→AVERS→CURCH→SFILE handshake every poll.
// The spa identity and pack versions never change at runtime.
let cachedSpaInfo: {
  host: string;
  spaId: string;
  spaName: string;
  platformKey: string;
  configVersion: number;
  logVersion: number;
  clientId: string;
} | null = null;

/** Clear cached connection info (e.g. when host changes). */
export function clearSpaCache(): void {
  cachedSpaInfo = null;
}

export async function readSpaState(host: string): Promise<SpaReading> {
  // Invalidate cache if host changed
  if (cachedSpaInfo && cachedSpaInfo.host !== host) {
    cachedSpaInfo = null;
  }

  const transport = new UdpTransport();
  await transport.open();
  const seq = new SequenceCounter();

  try {
    // Always do full handshake — the Gecko spa expects it per UDP session
    // (each session uses a new socket, so the spa doesn't remember us).
    // We only cache the platform/version info to avoid re-parsing FILES.
    const clientId = cachedSpaInfo?.clientId ?? generateClientId();

    // Step 1: HELLO — locate the spa
    const bareHello = Buffer.from("<HELLO>1</HELLO>", MESSAGE_ENCODING);

    let spaId = cachedSpaInfo?.spaId ?? "";
    let spaName = cachedSpaInfo?.spaName ?? "Unbekannt";
    let platformKey = cachedSpaInfo?.platformKey ?? "";
    let configVersion = cachedSpaInfo?.configVersion ?? 0;
    let logVersion = cachedSpaInfo?.logVersion ?? 0;

    const helloResult = await new Promise<{ spaId: string; spaName: string } | null>(
      (resolve) => {
        const timer = setTimeout(() => {
          transport.removeHandler(handler);
          resolve(null);
        }, 10_000);

        const handler: MessageHandler = (msg, rinfo) => {
          if (rinfo.address !== host) return;
          const str = msg.toString(MESSAGE_ENCODING);
          const match = str.match(/<HELLO>([\s\S]*?)<\/HELLO>/);
          if (!match) return;
          const text = match[1];
          if (text === "1" || text.startsWith("IOS") || text.startsWith("AND")) return;

          clearTimeout(timer);
          transport.removeHandler(handler);
          const parts = text.split("|");
          resolve({
            spaId: parts[0],
            spaName: parts.length > 1 ? parts[1] : "Unnamed SPA",
          });
        };

        transport.addHandler(handler);

        const targets = [host, "255.255.255.255"];
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            for (const addr of targets) {
              try {
                transport.send(bareHello, INTOUCH2_PORT, addr);
              } catch {
                /* socket may be closed */
              }
            }
          }, i * 1500);
        }
      }
    );

    if (!helloResult) {
      throw new Error(
        `Kein Spa gefunden unter ${host} — Gerät nicht erreichbar auf UDP-Port ${INTOUCH2_PORT}. ` +
        `Bitte prüfen: (1) IP-Adresse korrekt? (2) Gerät eingeschaltet? (3) Gleiche Netzwerk-Segment?`
      );
    }
    spaId = helloResult.spaId;
    spaName = helloResult.spaName;

    // Step 1b: Register client
    const clientHello = Buffer.from(`<HELLO>${clientId}</HELLO>`, MESSAGE_ENCODING);
    transport.send(clientHello, INTOUCH2_PORT, host);
    await sleep(200);

    // Step 2: AVERS — get firmware version
    const aversData = Buffer.alloc(6);
    aversData.write("AVERS", 0, MESSAGE_ENCODING);
    aversData.writeUInt8(seq.next(), 5);
    const aversPacket = buildPacket(clientId, spaId, aversData);

    await exchange(
      transport,
      aversPacket,
      INTOUCH2_PORT,
      host,
      "SVERS",
      PROTOCOL_TIMEOUT_MS
    );

    // Step 3: CURCH — get channel
    const curchData = Buffer.alloc(6);
    curchData.write("CURCH", 0, MESSAGE_ENCODING);
    curchData.writeUInt8(seq.next(), 5);
    const curchPacket = buildPacket(clientId, spaId, curchData);

    await exchange(
      transport,
      curchPacket,
      INTOUCH2_PORT,
      host,
      "CHCUR",
      PROTOCOL_TIMEOUT_MS
    );

    // Step 4: SFILE — only if we don't have cached platform info
    if (!cachedSpaInfo) {
      const sfileData = Buffer.alloc(6);
      sfileData.write("SFILE", 0, MESSAGE_ENCODING);
      sfileData.writeUInt8(seq.next(), 5);
      const sfilePacket = buildPacket(clientId, spaId, sfileData);

      const filesResult = await exchange(
        transport,
        sfilePacket,
        INTOUCH2_PORT,
        host,
        "FILES",
        PROTOCOL_TIMEOUT_MS
      );

      const filesStr = filesResult.data.subarray(5).toString(MESSAGE_ENCODING);
      const fileNames = filesStr.split(",").map((f) => f.replace(".xml", ""));

      for (const name of fileNames) {
        const parts = name.split("_");
        if (parts.length >= 2) {
          if (!platformKey) platformKey = parts[0];
          const suffix = parts[parts.length - 1];
          if (suffix.startsWith("C")) {
            configVersion = parseInt(suffix.substring(1), 10);
          } else if (suffix.startsWith("S")) {
            logVersion = parseInt(suffix.substring(1), 10);
          }
        }
      }

      // Cache platform info for subsequent polls
      cachedSpaInfo = { host, spaId, spaName, platformKey, configVersion, logVersion, clientId };
      console.log(`[Gecko] Connected: "${spaName}" (${spaId}), platform=${platformKey}, cfg=${configVersion}, log=${logVersion}`);
    }

    const spaIdentifier = spaId;

    // Step 5: STATU — request full status block
    const statuData = Buffer.alloc(10);
    statuData.write("STATU", 0, MESSAGE_ENCODING);
    statuData.writeUInt8(seq.next(), 5);
    statuData.writeUInt16BE(0, 6); // start offset
    statuData.writeUInt16BE(1024, 8); // length

    const statuPacket = buildPacket(clientId, spaIdentifier, statuData);

    // Collect status block chunks
    const statusBlock = Buffer.alloc(1024);
    let receivedChunks = 0;
    let maxChunkIndex = -1;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        transport.removeHandler(handler);
        if (receivedChunks > 0) {
          resolve(); // Accept partial data — better than nothing
        } else {
          reject(new Error("Status block request timeout"));
        }
      }, CONNECTION_TIMEOUT_MS);

      const handler: MessageHandler = (msg, rinfo) => {
        if (rinfo.address !== host) return;
        const parsed = parsePacket(msg);
        if (!parsed) return;
        const verb = parsed.data.subarray(0, 5).toString(MESSAGE_ENCODING);
        if (verb !== "STATV") return;

        // Parse STATV: verb(5) + index(1) + next_index(1) + length(1) + data
        const index = parsed.data.readUInt8(5);
        const nextIndex = parsed.data.readUInt8(6);
        const dataLen = parsed.data.readUInt8(7);
        const chunkData = parsed.data.subarray(8, 8 + dataLen);

        // Calculate offset: each chunk carries its position via index
        const offset = index * dataLen;
        if (offset + chunkData.length <= statusBlock.length) {
          chunkData.copy(statusBlock, offset);
        }
        receivedChunks++;
        if (index > maxChunkIndex) maxChunkIndex = index;

        // nextIndex === 0 means this is the last chunk
        if (nextIndex === 0) {
          clearTimeout(timer);
          transport.removeHandler(handler);
          resolve();
        }
      };

      transport.addHandler(handler);
      transport.send(statuPacket, INTOUCH2_PORT, host);

      // Retry after 2s if no response
      setTimeout(() => {
        if (receivedChunks === 0) {
          try {
            transport.send(statuPacket, INTOUCH2_PORT, host);
          } catch {
            /* ignore */
          }
        }
      }, 2000);
    });

    if (receivedChunks < 20) {
      console.warn(`[Gecko] Partial status block: ${receivedChunks} chunks (may have incomplete device data)`);
    } else {
      console.log(`[Gecko] Status block: ${receivedChunks} chunks received (max index: ${maxChunkIndex})`);
    }

    // Debug: dump non-zero bytes in the status block to locate pump data
    const nonZeroRanges: string[] = [];
    for (let i = 250; i < 330 && i < statusBlock.length; i++) {
      const b = statusBlock.readUInt8(i);
      if (b !== 0) {
        nonZeroRanges.push(`[${i}]=0x${b.toString(16).padStart(2, '0')}(${b})`);
      }
    }
    console.log(`[Gecko] Non-zero bytes @250-330: ${nonZeroRanges.length > 0 ? nonZeroRanges.join(' ') : 'ALL ZERO'}`);

    // Step 6: Parse status block using pack definitions
    const reading = parseStatusBlock(statusBlock, platformKey, configVersion, logVersion, spaName, spaId);

    // Step 7: GETWC — get watercare mode (separate protocol, not in status block)
    try {
      const getwcData = Buffer.alloc(6);
      getwcData.write("GETWC", 0, MESSAGE_ENCODING);
      getwcData.writeUInt8(seq.next(), 5);
      const getwcPacket = buildPacket(clientId, spaIdentifier, getwcData);
      const wcResult = await exchange(transport, getwcPacket, INTOUCH2_PORT, host, "WCGET", PROTOCOL_TIMEOUT_MS, 2);
      // WCGET response: verb(5) + seq(1) + mode(1)
      if (wcResult.data.length >= 7) {
        const modeIndex = wcResult.data.readUInt8(6);
        reading.watercare = WATERCARE_MODES[modeIndex] ?? `Modus ${modeIndex}`;
      }
    } catch {
      // Watercare not supported or timeout — leave as null
    }

    // Step 8: REQRM — get reminders (separate protocol)
    try {
      const reqrmData = Buffer.alloc(6);
      reqrmData.write("REQRM", 0, MESSAGE_ENCODING);
      reqrmData.writeUInt8(seq.next(), 5);
      const reqrmPacket = buildPacket(clientId, spaIdentifier, reqrmData);
      const rmResult = await exchange(transport, reqrmPacket, INTOUCH2_PORT, host, "RMREQ", PROTOCOL_TIMEOUT_MS, 2);
      // RMREQ response: verb(5) + seq(1) + count(1) + [type(1) + days(2)] * count
      if (rmResult.data.length >= 7) {
        const count = rmResult.data.readUInt8(6);
        for (let i = 0; i < count && 7 + i * 3 + 2 < rmResult.data.length; i++) {
          const offset = 7 + i * 3;
          const type = rmResult.data.readUInt8(offset);
          const days = rmResult.data.readInt16BE(offset + 1);
          const typeName = REMINDER_TYPES[type] ?? `Erinnerung ${type}`;
          reading.reminders.push({ type: typeName, daysRemaining: days });
        }
      }
    } catch {
      // Reminders not supported or timeout — leave empty
    }

    return reading;
  } finally {
    transport.close();
  }
}

/**
 * Debug version of readSpaState — returns raw status block bytes
 * for diagnosing pump state parsing issues.
 */
export async function readSpaStateDebug(host: string): Promise<{
  platformKey: string;
  configVersion: number;
  logVersion: number;
  receivedChunks: number;
  statusBlockHex: string;
  deviceRegion: Record<string, { dec: number; hex: string; bin: string }>;
  pumpRegion: Record<string, number>;
  tempRegion: Record<string, number>;
  nonZeroBytes: { pos: number; val: number; hex: string }[];
  reading: SpaReading;
}> {
  // Use the same connection logic but capture raw data
  if (cachedSpaInfo && cachedSpaInfo.host !== host) {
    cachedSpaInfo = null;
  }

  const transport = new UdpTransport();
  await transport.open();
  const seq = new SequenceCounter();

  try {
    const clientId = cachedSpaInfo?.clientId ?? generateClientId();
    const bareHello = Buffer.from("<HELLO>1</HELLO>", MESSAGE_ENCODING);

    let spaId = cachedSpaInfo?.spaId ?? "";
    let spaName = cachedSpaInfo?.spaName ?? "Unbekannt";
    let platformKey = cachedSpaInfo?.platformKey ?? "";
    let configVersion = cachedSpaInfo?.configVersion ?? 0;
    let logVersion = cachedSpaInfo?.logVersion ?? 0;

    // Abbreviated handshake for debug
    const helloResult = await new Promise<{ spaId: string; spaName: string } | null>(
      (resolve) => {
        const timer = setTimeout(() => { transport.removeHandler(handler); resolve(null); }, 10_000);
        const handler: MessageHandler = (msg, rinfo) => {
          if (rinfo.address !== host) return;
          const str = msg.toString(MESSAGE_ENCODING);
          const match = str.match(/<HELLO>([\s\S]*?)<\/HELLO>/);
          if (!match) return;
          const text = match[1];
          if (text === "1" || text.startsWith("IOS") || text.startsWith("AND")) return;
          clearTimeout(timer);
          transport.removeHandler(handler);
          const parts = text.split("|");
          resolve({ spaId: parts[0], spaName: parts.length > 1 ? parts[1] : "Unnamed SPA" });
        };
        transport.addHandler(handler);
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            try { transport.send(bareHello, INTOUCH2_PORT, host); } catch {}
            try { transport.send(bareHello, INTOUCH2_PORT, "255.255.255.255"); } catch {}
          }, i * 1500);
        }
      }
    );

    if (!helloResult) throw new Error("Spa not reachable");
    spaId = helloResult.spaId;
    spaName = helloResult.spaName;

    const clientHello = Buffer.from(`<HELLO>${clientId}</HELLO>`, MESSAGE_ENCODING);
    transport.send(clientHello, INTOUCH2_PORT, host);
    await sleep(200);

    // AVERS
    const aversData = Buffer.alloc(6);
    aversData.write("AVERS", 0, MESSAGE_ENCODING);
    aversData.writeUInt8(seq.next(), 5);
    await exchange(transport, buildPacket(clientId, spaId, aversData), INTOUCH2_PORT, host, "SVERS", PROTOCOL_TIMEOUT_MS);

    // CURCH
    const curchData = Buffer.alloc(6);
    curchData.write("CURCH", 0, MESSAGE_ENCODING);
    curchData.writeUInt8(seq.next(), 5);
    await exchange(transport, buildPacket(clientId, spaId, curchData), INTOUCH2_PORT, host, "CHCUR", PROTOCOL_TIMEOUT_MS);

    // SFILE
    if (!cachedSpaInfo) {
      const sfileData = Buffer.alloc(6);
      sfileData.write("SFILE", 0, MESSAGE_ENCODING);
      sfileData.writeUInt8(seq.next(), 5);
      const filesResult = await exchange(transport, buildPacket(clientId, spaId, sfileData), INTOUCH2_PORT, host, "FILES", PROTOCOL_TIMEOUT_MS);
      const filesStr = filesResult.data.subarray(5).toString(MESSAGE_ENCODING);
      for (const name of filesStr.split(",").map(f => f.replace(".xml", ""))) {
        const parts = name.split("_");
        if (parts.length >= 2) {
          if (!platformKey) platformKey = parts[0];
          const suffix = parts[parts.length - 1];
          if (suffix.startsWith("C")) configVersion = parseInt(suffix.substring(1), 10);
          else if (suffix.startsWith("S")) logVersion = parseInt(suffix.substring(1), 10);
        }
      }
      cachedSpaInfo = { host, spaId, spaName, platformKey, configVersion, logVersion, clientId };
    }

    // STATU
    const statuData = Buffer.alloc(10);
    statuData.write("STATU", 0, MESSAGE_ENCODING);
    statuData.writeUInt8(seq.next(), 5);
    statuData.writeUInt16BE(0, 6);
    statuData.writeUInt16BE(1024, 8);
    const statuPacket = buildPacket(clientId, spaId, statuData);

    const statusBlock = Buffer.alloc(1024);
    let receivedChunks = 0;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        transport.removeHandler(handler);
        receivedChunks > 0 ? resolve() : reject(new Error("Status block timeout"));
      }, CONNECTION_TIMEOUT_MS);

      const handler: MessageHandler = (msg, rinfo) => {
        if (rinfo.address !== host) return;
        const parsed = parsePacket(msg);
        if (!parsed) return;
        if (parsed.data.subarray(0, 5).toString(MESSAGE_ENCODING) !== "STATV") return;
        const index = parsed.data.readUInt8(5);
        const nextIndex = parsed.data.readUInt8(6);
        const dataLen = parsed.data.readUInt8(7);
        const chunkData = parsed.data.subarray(8, 8 + dataLen);
        const offset = index * dataLen;
        if (offset + chunkData.length <= statusBlock.length) chunkData.copy(statusBlock, offset);
        receivedChunks++;
        if (nextIndex === 0) { clearTimeout(timer); transport.removeHandler(handler); resolve(); }
      };

      transport.addHandler(handler);
      transport.send(statuPacket, INTOUCH2_PORT, host);
      setTimeout(() => { if (receivedChunks === 0) try { transport.send(statuPacket, INTOUCH2_PORT, host); } catch {} }, 2000);
    });

    // Collect all non-zero bytes in range 0-400
    const nonZeroBytes: { pos: number; val: number; hex: string }[] = [];
    for (let i = 0; i < Math.min(400, statusBlock.length); i++) {
      const b = statusBlock.readUInt8(i);
      if (b !== 0) nonZeroBytes.push({ pos: i, val: b, hex: `0x${b.toString(16).padStart(2, '0')}` });
    }

    // Device region: bytes 250-270 with binary decomposition
    const deviceRegion: Record<string, { dec: number; hex: string; bin: string }> = {};
    for (let i = 250; i <= 270; i++) {
      const b = statusBlock.readUInt8(i);
      deviceRegion[`byte_${i}`] = {
        dec: b,
        hex: `0x${b.toString(16).padStart(2, '0')}`,
        bin: `0b${b.toString(2).padStart(8, '0')}`,
      };
    }

    // Temp region: bytes 270-290
    const tempRegion: Record<string, number> = {};
    for (let i = 270; i <= 290; i++) tempRegion[`byte_${i}`] = statusBlock.readUInt8(i);

    // Full hex of range 250-330
    const statusBlockHex = statusBlock.subarray(250, 330).toString('hex');

    const reading = parseStatusBlock(statusBlock, platformKey, configVersion, logVersion, spaName, spaId);

    // Pump region summary (legacy format)
    const pumpRegion: Record<string, number> = {};
    for (let i = 255; i <= 270; i++) pumpRegion[`byte_${i}`] = statusBlock.readUInt8(i);

    return { platformKey, configVersion, logVersion, receivedChunks, statusBlockHex, deviceRegion, pumpRegion, tempRegion, nonZeroBytes, reading };
  } finally {
    transport.close();
  }
}

// ── Status block parsing ─────────────────────────────────────────

type PackRegistry = Record<
  string,
  {
    name: string;
    type: number | null;
    cfg: Record<string, Record<string, AccessorDef>>;
    log: Record<string, Record<string, AccessorDef>>;
  }
>;

type AccessorDef = {
  t: string; // T=Temp, B=Byte/Bool, E=Enum, W=Word, Ti=Time
  p: number; // byte position
  b?: number; // bit position (for Bool/Enum)
  o?: string[]; // enum options
};

const packs = packsData as PackRegistry;

function readByte(block: Buffer, pos: number): number {
  if (pos < 0 || pos >= block.length) return 0;
  return block.readUInt8(pos);
}

function readWord(block: Buffer, pos: number): number {
  if (pos < 0 || pos + 1 >= block.length) return 0;
  return block.readUInt16BE(pos);
}

function readTemp(block: Buffer, pos: number, isCelsius: boolean): number {
  const raw = readWord(block, pos);
  if (raw === 0) return 0;
  // geckolib: Celsius = raw / 18.0, Fahrenheit = (raw + 320) / 10.0
  return isCelsius ? raw / 18.0 : (raw + 320) / 10.0;
}

function readEnum(
  block: Buffer,
  pos: number,
  bitPos: number | undefined,
  options: string[] | undefined
): string {
  const byte = readByte(block, pos);
  if (bitPos != null && options) {
    const bitsNeeded = Math.ceil(Math.log2(options.length || 1));
    const mask = (1 << bitsNeeded) - 1;
    const value = (byte >> bitPos) & mask;
    return options[value] ?? "";
  }
  if (options) {
    return options[byte] ?? "";
  }
  return String(byte);
}

function readBool(block: Buffer, pos: number, bitPos: number): boolean {
  const byte = readByte(block, pos);
  return ((byte >> bitPos) & 1) === 1;
}

function findPackDef(
  platformKey: string,
  configVersion: number,
  logVersion: number
): {
  cfg: Record<string, AccessorDef> | null;
  log: Record<string, AccessorDef> | null;
} {
  // Normalize platform key: lowercase, handle common aliases
  const key = platformKey.toLowerCase().replace(/\s+/g, "");

  // Direct match
  if (packs[key]) {
    const pack = packs[key];
    const cfg = findBestVersion(pack.cfg, configVersion);
    const log = findBestVersion(pack.log, logVersion);
    return { cfg, log };
  }

  // Try with version suffixes (e.g., "inyt" might need "inyt-v2")
  for (const packKey of Object.keys(packs)) {
    if (packKey.startsWith(key + "-") || packKey === key) {
      const pack = packs[packKey];
      const cfg = findBestVersion(pack.cfg, configVersion);
      const log = findBestVersion(pack.log, logVersion);
      if (cfg || log) return { cfg, log };
    }
  }

  return { cfg: null, log: null };
}

function findBestVersion(
  versions: Record<string, Record<string, AccessorDef>>,
  target: number
): Record<string, AccessorDef> | null {
  if (!versions) return null;
  // Exact match
  if (versions[String(target)]) return versions[String(target)];
  // Find closest version
  const available = Object.keys(versions)
    .map(Number)
    .sort((a, b) => a - b);
  if (available.length === 0) return null;
  // Find nearest version
  let best = available[0];
  for (const v of available) {
    if (Math.abs(v - target) < Math.abs(best - target)) best = v;
  }
  return versions[String(best)];
}

function parseStatusBlock(
  block: Buffer,
  platformKey: string,
  configVersion: number,
  logVersion: number,
  spaName: string,
  spaId: string
): SpaReading {
  const { cfg, log } = findPackDef(platformKey, configVersion, logVersion);

  if (!cfg && !log) {
    console.warn(`[Gecko] No pack definition found for platform="${platformKey}" cfg=${configVersion} log=${logVersion}`);
  }

  // ── Read pump status ────────────────────────────────────────────────
  // Pack definition has two pump-related bytes:
  //   P1-P4 (device status) at byte 261: ["OFF", "HIGH", "LOW"]
  //   UdP1-UdP4 (user demand) at byte 259: ["OFF", "LO", "HI"]
  //
  // Some spas with VSP (Variable Speed Pump) communication issues don't
  // populate the P1 device status byte. In that case, fall back to UdP
  // (user demand) which shows what the controller requested.
  const packP1Pos = log?.P1?.p ?? 261;
  const packUdPPos = packP1Pos - 2; // UdP is always 2 bytes before P1
  const p1Byte = readByte(block, packP1Pos);
  const udpByte = readByte(block, packUdPPos);

  let actualPumpPos: number;
  let readingUserDemand = false;

  if (p1Byte !== 0) {
    actualPumpPos = packP1Pos;
    console.log(`[Gecko] Pump source: P1 device status at byte ${packP1Pos} (0x${p1Byte.toString(16)})`);
  } else if (udpByte !== 0) {
    actualPumpPos = packUdPPos;
    readingUserDemand = true;
    console.log(`[Gecko] Pump source: UdP (user demand) at byte ${packUdPPos} (0x${udpByte.toString(16)}) — P1 byte empty`);
  } else {
    // Both empty — no pumps running, use P1 position (will show all OFF)
    actualPumpPos = packP1Pos;
  }

  // UdP: value 1=LO, 2=HI  |  P1: value 1=HIGH, 2=LOW
  const pumpValueMap = readingUserDemand
    ? { 0: "OFF", 1: "LOW", 2: "HIGH" }
    : { 0: "OFF", 1: "HIGH", 2: "LOW" };

  // ── Device flags ──────────────────────────────────────────────────
  // Use pack-defined positions directly (same as HA integration).
  // Byte 260 bit layout: P5=0, BL=1, CP=2, O3=3, L120=4, Heating=5-6, SLV=7
  // This byte is 0 when no devices are active — that's correct.
  const deviceFlagByte = readByte(block, log?.CP?.p ?? (packP1Pos - 1));
  console.log(`[Gecko] Device flags byte ${log?.CP?.p ?? (packP1Pos - 1)}: 0x${deviceFlagByte.toString(16).padStart(2, '0')} (0b${deviceFlagByte.toString(2).padStart(8, '0')})`);
  console.log(`[Gecko] UdP5 byte ${packUdPPos - 1}: 0x${readByte(block, packUdPPos - 1).toString(16).padStart(2, '0')}`);

  // Determine temperature units
  let isCelsius = true;
  if (cfg?.TempUnits) {
    const units = readEnum(block, cfg.TempUnits.p, cfg.TempUnits.b, cfg.TempUnits.o);
    isCelsius = units === "C";
  }

  // Read temperature values (temperature positions are NOT affected by device offset)
  let temperature: number | null = null;
  let setPoint: number | null = null;
  let minTemp: number | null = null;
  let maxTemp: number | null = null;

  if (log?.DisplayedTempG) {
    const val = readTemp(block, log.DisplayedTempG.p, isCelsius);
    if (val > 0) temperature = Math.round(val * 10) / 10;
  } else if (log?.RhWaterTemp) {
    const val = readTemp(block, log.RhWaterTemp.p, isCelsius);
    if (val > 0) temperature = Math.round(val * 10) / 10;
  }

  if (log?.RealSetPointG) {
    const val = readTemp(block, log.RealSetPointG.p, isCelsius);
    if (val > 0) setPoint = Math.round(val * 10) / 10;
  } else if (cfg?.SetpointG) {
    const val = readTemp(block, cfg.SetpointG.p, isCelsius);
    if (val > 0) setPoint = Math.round(val * 10) / 10;
  }

  if (cfg?.MinSetpointG) {
    const val = readTemp(block, cfg.MinSetpointG.p, isCelsius);
    if (val > 0) minTemp = Math.round(val * 10) / 10;
  }

  if (cfg?.MaxSetpointG) {
    const val = readTemp(block, cfg.MaxSetpointG.p, isCelsius);
    if (val > 0) maxTemp = Math.round(val * 10) / 10;
  }

  // Read heating status — directly from pack-defined position
  let heatingStatus: string | null = null;
  if (log?.Heating) {
    const val = readEnum(block, log.Heating.p, log.Heating.b, log.Heating.o);
    heatingStatus = val === "Heating" ? "Heating" : "Idle";
  }
  if (log?.CoolingDown) {
    const cooling = readBool(block, log.CoolingDown.p, log.CoolingDown.b ?? 0);
    if (cooling) heatingStatus = "Cooling";
  }

  // Read pumps — from P1 device status byte, or UdP (user demand) as fallback
  const pumps: { id: string; active: boolean; mode: string | null }[] = [];
  const pumpKeys = ["P1", "P2", "P3", "P4", "P5"];
  for (const key of pumpKeys) {
    const acc = log?.[key];
    if (acc) {
      // P5 is a single-speed pump at bit 0 of the device flags byte (260)
      // P1-P4 are 2-bit packed in the pump byte (261 or 259 UdP fallback)
      if (key === "P5") {
        const val = readEnum(block, acc.p, acc.b, acc.o);
        pumps.push({ id: key, active: val !== "OFF" && val !== "", mode: val || null });
      } else {
        const bitPos = acc.b ?? 0;
        const rawByte = readByte(block, actualPumpPos);
        const rawValue = (rawByte >> bitPos) & 0x03;
        const mode = pumpValueMap[rawValue as 0 | 1 | 2] ?? "OFF";
        pumps.push({ id: key, active: mode !== "OFF", mode: mode === "OFF" ? null : mode });
      }
    }
  }

  // Read circulation pump (CP) — directly from pack position
  let circulationPump: { active: boolean } | null = null;
  if (log?.CP) {
    const val = readEnum(block, log.CP.p, log.CP.b, log.CP.o);
    circulationPump = { active: val === "ON" };
  }

  // Read ozone (O3) — directly from pack position
  let ozone: { active: boolean } | null = null;
  if (log?.O3) {
    const val = readEnum(block, log.O3.p, log.O3.b, log.O3.o);
    ozone = { active: val === "ON" };
  }

  // Read waterfall — device status at byte 260 bit 7, fallback to UdWaterfall byte 363
  let waterfall: { active: boolean } | null = null;
  if (log?.Waterfall) {
    const val = readEnum(block, log.Waterfall.p, log.Waterfall.b, log.Waterfall.o);
    if (val === "ON") {
      waterfall = { active: true };
    } else {
      // Device status empty — check user demand (UdWaterfall at byte 363)
      const UDWATERFALL_POS = 363;
      const udWfVal = readByte(block, UDWATERFALL_POS);
      waterfall = { active: udWfVal > 0 };
    }
  } else {
    // No pack def — try UdWaterfall directly
    const UDWATERFALL_POS = 363;
    const udWfVal = readByte(block, UDWATERFALL_POS);
    waterfall = { active: udWfVal > 0 };
  }

  // Read economy mode
  let econActive = false;
  if (log?.EconActive) {
    econActive = readBool(block, log.EconActive.p, log.EconActive.b ?? 0);
  }

  // Read quiet/standby state
  let quietState: string | null = null;
  if (log?.QuietState) {
    quietState = readEnum(block, log.QuietState.p, log.QuietState.b, log.QuietState.o);
  }

  // Read lock mode
  let lockMode: string | null = null;
  if (log?.LockMode) {
    lockMode = readEnum(block, log.LockMode.p, log.LockMode.b, log.LockMode.o);
  }

  // Read heaters — directly from pack position
  let masterHeater: { active: boolean } | null = null;
  if (log?.MSTR_HEATER) {
    const val = readEnum(block, log.MSTR_HEATER.p, log.MSTR_HEATER.b, log.MSTR_HEATER.o);
    masterHeater = { active: val === "ON" };
  }
  let slaveHeater: { active: boolean } | null = null;
  if (log?.SLV_HEATER) {
    const val = readEnum(block, log.SLV_HEATER.p, log.SLV_HEATER.b, log.SLV_HEATER.o);
    slaveHeater = { active: val === "ON" };
  }

  // Read lights
  // LI has no device status byte — read from UdLi (user demand) at byte 307
  // L120 device status is at byte 260 bit 4, user demand at byte 308
  const lights: { id: string; active: boolean }[] = [];

  // UdLi (main light user demand): byte 307, full byte, ["OFF", "HI"]
  const UDLI_POS = 307;
  const udLiVal = readByte(block, UDLI_POS);
  lights.push({ id: "LI", active: udLiVal > 0 });

  // L120 from device status byte 260 bit 4, fallback to UdL120 byte 308
  if (log?.L120) {
    const val = readEnum(block, log.L120.p, log.L120.b, log.L120.o);
    if (val !== "OFF" && val !== "") {
      lights.push({ id: "L120", active: true });
    } else {
      const UDL120_POS = 308;
      const udL120Val = readByte(block, UDL120_POS);
      lights.push({ id: "L120", active: udL120Val > 0 });
    }
  }

  // Collect errors from known error keys
  const errors: string[] = [];
  const errorKeys = [
    "OverTemp", "HeaterStuck", "RegOverHeat", "RelayStuck",
    "RhRegProbeErr", "ThermFuseErr", "ThermistanceErr",
    "KinPumpOff", "P1HStuck", "P2HStuck",
    "FiltSuspendedByErr", "TempNotValid", "AmbiantOHLevel2",
  ];
  for (const key of errorKeys) {
    const acc = log?.[key];
    if (acc) {
      const isErr = readBool(block, acc.p, acc.b ?? 0);
      if (isErr) errors.push(key);
    }
  }

  return {
    spaName,
    spaId,
    temperature,
    setPoint,
    heatingStatus,
    minTemp,
    maxTemp,
    tempUnit: isCelsius ? "C" : "F",
    pumps,
    circulationPump,
    ozone,
    waterfall,
    lights,
    econActive,
    quietState,
    lockMode,
    masterHeater,
    slaveHeater,
    watercare: null, // fetched via separate GETWC protocol in readSpaState
    reminders: [], // fetched via separate REQRM protocol in readSpaState
    errors,
  };
}

// ── Diagnostics ─────────────────────────────────────────────────

export type DiagnosticStep = {
  step: string;
  status: "ok" | "fail" | "skip";
  detail: string;
  durationMs: number;
};

export type DiagnosticResult = {
  host: string;
  steps: DiagnosticStep[];
  success: boolean;
};

/** Get local network interfaces for diagnostics. */
function getLocalNetworkInfo(): { ip: string; subnet: string }[] {
  const interfaces = networkInterfaces();
  const results: { ip: string; subnet: string }[] = [];
  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        results.push({ ip: addr.address, subnet: addr.netmask });
      }
    }
  }
  return results;
}

/** Check if two IPs are on the same subnet. */
function sameSubnet(ip1: string, ip2: string, netmask: string): boolean {
  const p1 = ip1.split(".").map(Number);
  const p2 = ip2.split(".").map(Number);
  const m = netmask.split(".").map(Number);
  return p1.every((_, i) => (p1[i] & m[i]) === (p2[i] & m[i]));
}

/** Try to reach a host via TCP (basic reachability check). */
async function tcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Run a step-by-step connection diagnostic against a Gecko device.
 * Returns detailed results for each protocol phase.
 */
export async function diagnoseSpa(host: string): Promise<DiagnosticResult> {
  const steps: DiagnosticStep[] = [];

  // Step 0: Network analysis — check if host is on same subnet
  let t0 = Date.now();
  const localNets = getLocalNetworkInfo();
  const onSameSubnet = localNets.some((n) => sameSubnet(n.ip, host, n.subnet));
  const localIps = localNets.map((n) => n.ip).join(", ");
  steps.push({
    step: "network",
    status: onSameSubnet ? "ok" : "fail",
    detail: onSameSubnet
      ? `Dashboard (${localIps}) und Gecko (${host}) im gleichen Subnetz`
      : `Dashboard (${localIps}) und Gecko (${host}) in VERSCHIEDENEN Subnetzen — UDP wird blockiert. Dashboard und Gecko müssen im gleichen Netzwerk-Segment sein.`,
    durationMs: Date.now() - t0,
  });

  // Step 0b: Try TCP probe on common ports (80 for HTTP, 10022 for gecko)
  t0 = Date.now();
  const httpReachable = await tcpProbe(host, 80, 3_000);
  const geckoPortReachable = await tcpProbe(host, INTOUCH2_PORT, 3_000);
  const probeDetail = [
    `HTTP (Port 80): ${httpReachable ? "erreichbar" : "nicht erreichbar"}`,
    `Gecko (Port ${INTOUCH2_PORT}): ${geckoPortReachable ? "TCP erreichbar" : "nicht erreichbar"}`,
  ].join(", ");
  steps.push({
    step: "reachability",
    status: httpReachable || geckoPortReachable ? "ok" : "fail",
    detail: probeDetail,
    durationMs: Date.now() - t0,
  });

  // If not on same subnet and no port reachable, skip UDP test
  if (!onSameSubnet && !httpReachable && !geckoPortReachable) {
    steps.push({
      step: "hello",
      status: "skip",
      detail: `UDP-Test übersprungen — Host nicht erreichbar. Prüfen: (1) IP korrekt? (2) Dashboard und Gecko im gleichen VLAN/Subnetz?`,
      durationMs: 0,
    });
    return { host, steps, success: false };
  }

  const transport = new UdpTransport();

  // Step 1: Open UDP socket
  t0 = Date.now();
  try {
    await transport.open();
    steps.push({ step: "udp_socket", status: "ok", detail: "UDP-Socket geöffnet", durationMs: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "udp_socket", status: "fail", detail: `Socket-Fehler: ${err instanceof Error ? err.message : err}`, durationMs: Date.now() - t0 });
    return { host, steps, success: false };
  }

  // Step 2: Send bare HELLO (unicast + broadcast), wait for response
  t0 = Date.now();
  const clientId = generateClientId();
  // Discovery HELLO must be bare (no PACKT wrapping!) per geckolib protocol.
  const bareHello = Buffer.from("<HELLO>1</HELLO>", MESSAGE_ENCODING);

  let helloResponse: string | null = null;
  let responseSource: string | null = null;

  try {
    const result = await new Promise<{ text: string; from: string } | null>((resolve) => {
      const timer = setTimeout(() => {
        transport.removeHandler(handler);
        resolve(null);
      }, 10_000);

      const handler: MessageHandler = (msg, rinfo) => {
        // Discovery responses are bare <HELLO>...</HELLO> (no PACKT)
        const str = msg.toString(MESSAGE_ENCODING);
        const match = str.match(/<HELLO>([\s\S]*?)<\/HELLO>/);
        if (!match) return;
        const text = match[1];
        if (text === "1" || text.startsWith("IOS") || text.startsWith("AND")) return;
        clearTimeout(timer);
        transport.removeHandler(handler);
        resolve({ text, from: rinfo.address });
      };

      transport.addHandler(handler);

      // Send bare HELLO to both unicast and broadcast
      const targets = [host, "255.255.255.255"];
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          for (const addr of targets) {
            try { transport.send(bareHello, INTOUCH2_PORT, addr); } catch { /* */ }
          }
        }, i * 1500);
      }
    });

    if (result) {
      helloResponse = result.text;
      responseSource = result.from;
      const matchesHost = result.from === host;
      steps.push({
        step: "hello",
        status: "ok",
        detail: `Antwort von ${result.from}: "${result.text}"${matchesHost ? "" : ` (WARNUNG: erwartet ${host})`}`,
        durationMs: Date.now() - t0,
      });
    } else {
      steps.push({
        step: "hello",
        status: "fail",
        detail: `Keine Antwort nach 10s auf UDP-Port ${INTOUCH2_PORT}. ${!onSameSubnet ? "Ursache: unterschiedliche Subnetze (s.o.)." : "Gerät antwortet nicht auf Gecko-Protokoll."}`,
        durationMs: Date.now() - t0,
      });
      transport.close();
      return { host, steps, success: false };
    }
  } catch (err) {
    steps.push({ step: "hello", status: "fail", detail: `HELLO-Fehler: ${err instanceof Error ? err.message : err}`, durationMs: Date.now() - t0 });
    transport.close();
    return { host, steps, success: false };
  }

  // Step 2b: Register client with bare HELLO
  const spaId = helloResponse!.split("|")[0];
  const clientHello = Buffer.from(`<HELLO>${clientId}</HELLO>`, MESSAGE_ENCODING);
  transport.send(clientHello, INTOUCH2_PORT, responseSource!);
  await sleep(200);

  // Step 3: Try AVERS (version exchange)
  t0 = Date.now();
  try {
    const seq = new SequenceCounter();
    const aversData = Buffer.alloc(6);
    aversData.write("AVERS", 0, MESSAGE_ENCODING);
    aversData.writeUInt8(seq.next(), 5);
    const aversPacket = buildPacket(clientId, spaId, aversData);

    await exchange(transport, aversPacket, INTOUCH2_PORT, responseSource!, "SVERS", PROTOCOL_TIMEOUT_MS);
    steps.push({ step: "version", status: "ok", detail: "Firmware-Version empfangen", durationMs: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "version", status: "fail", detail: `AVERS fehlgeschlagen: ${err instanceof Error ? err.message : err}`, durationMs: Date.now() - t0 });
    transport.close();
    return { host, steps, success: false };
  }

  transport.close();
  return { host, steps, success: steps.every((s) => s.status === "ok") };
}

// ── Utility ──────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
