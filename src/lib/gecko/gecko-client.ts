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
import packsData from "./packs.json";

// ── Constants ────────────────────────────────────────────────────

const INTOUCH2_PORT = 10022;
const MESSAGE_ENCODING = "latin1" as const;
const PROTOCOL_TIMEOUT_MS = 4_000;
const DISCOVERY_TIMEOUT_MS = 8_000;
const CONNECTION_TIMEOUT_MS = 30_000;

/** Generate a geckolib-compatible client identifier: IOS1<8 hex chars> */
function generateClientId(): string {
  const hex = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join("");
  return `IOS1${hex}`;
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
    const clientId = generateClientId();
    // Build HELLO broadcast
    const helloData = wrapXml("HELLO", Buffer.from("1"));
    const packet = buildPacket(clientId, "", helloData);

    const spas: DiscoveredSpa[] = [];
    const broadcastAddr = targetAddress ?? "255.255.255.255";

    const handler: MessageHandler = (msg, rinfo) => {
      const parsed = parsePacket(msg);
      if (!parsed) return;
      const helloContent = unwrapXml("HELLO", parsed.data);
      if (!helloContent) return;
      const content = helloContent.toString(MESSAGE_ENCODING);
      // Skip our own broadcasts
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
      transport.send(packet, INTOUCH2_PORT, broadcastAddr);
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
  lights: { id: string; active: boolean }[];
  watercare: string | null;
};

export async function readSpaState(host: string): Promise<SpaReading> {
  const transport = new UdpTransport();
  await transport.open();
  const seq = new SequenceCounter();

  try {
    // Step 1: HELLO — locate the spa
    const clientId = generateClientId();
    const helloData = wrapXml("HELLO", Buffer.from("1"));
    const helloPacket = buildPacket(clientId, "", helloData);

    let spaId = "";
    let spaName = "Unbekannt";

    const helloResult = await new Promise<{ spaId: string; spaName: string } | null>(
      (resolve) => {
        const timer = setTimeout(() => {
          transport.removeHandler(handler);
          resolve(null);
        }, 10_000);

        const handler: MessageHandler = (msg, rinfo) => {
          if (rinfo.address !== host) return;
          const parsed = parsePacket(msg);
          if (!parsed) return;
          const content = unwrapXml("HELLO", parsed.data);
          if (!content) return;
          const text = content.toString(MESSAGE_ENCODING);
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

        // Send HELLO to both unicast (target IP) and broadcast.
        // Some Gecko devices only respond to broadcast HELLO.
        const targets = [host, "255.255.255.255"];
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            for (const addr of targets) {
              try {
                transport.send(helloPacket, INTOUCH2_PORT, addr);
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

    const spaIdentifier = spaId;

    // Step 2: AVERS — get firmware version
    const aversData = Buffer.alloc(6);
    aversData.write("AVERS", 0, MESSAGE_ENCODING);
    aversData.writeUInt8(seq.next(), 5);
    const aversPacket = buildPacket(clientId, spaIdentifier, aversData);

    const versResult = await exchange(
      transport,
      aversPacket,
      INTOUCH2_PORT,
      host,
      "SVERS",
      PROTOCOL_TIMEOUT_MS
    );
    // Parse version (12 bytes after verb): en_build(2) en_major(1) en_minor(1) co_build(2) co_major(1) co_minor(1)
    // We don't need version data, but the exchange confirms the connection

    // Step 3: CURCH — get channel
    const curchData = Buffer.alloc(6);
    curchData.write("CURCH", 0, MESSAGE_ENCODING);
    curchData.writeUInt8(seq.next(), 5);
    const curchPacket = buildPacket(clientId, spaIdentifier, curchData);

    await exchange(
      transport,
      curchPacket,
      INTOUCH2_PORT,
      host,
      "CHCUR",
      PROTOCOL_TIMEOUT_MS
    );

    // Step 4: SFILE — get config file info (platform key, versions)
    const sfileData = Buffer.alloc(6);
    sfileData.write("SFILE", 0, MESSAGE_ENCODING);
    sfileData.writeUInt8(seq.next(), 5);
    const sfilePacket = buildPacket(clientId, spaIdentifier, sfileData);

    const filesResult = await exchange(
      transport,
      sfilePacket,
      INTOUCH2_PORT,
      host,
      "FILES",
      PROTOCOL_TIMEOUT_MS
    );

    // Parse FILES response: "FILES{comma-separated filenames}"
    const filesStr = filesResult.data.subarray(5).toString(MESSAGE_ENCODING);
    const fileNames = filesStr.split(",").map((f) => f.replace(".xml", ""));
    // Extract platform key, config version, log version
    // Format: "{platform}_C{config_ver}.xml,{platform}_S{log_ver}.xml"
    let platformKey = "";
    let configVersion = 0;
    let logVersion = 0;

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
    let expectedChunks = -1;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        transport.removeHandler(handler);
        if (receivedChunks > 0) {
          resolve(); // Accept partial data
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

    // Step 6: Parse status block using pack definitions
    return parseStatusBlock(statusBlock, platformKey, configVersion, logVersion, spaName, spaId);
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

  // Determine temperature units
  let isCelsius = true;
  if (cfg?.TempUnits) {
    const units = readEnum(block, cfg.TempUnits.p, cfg.TempUnits.b, cfg.TempUnits.o);
    isCelsius = units === "C";
  }

  // Read temperature values
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

  // Read heating status
  let heatingStatus: string | null = null;
  if (log?.Heating) {
    const val = readEnum(block, log.Heating.p, log.Heating.b, log.Heating.o);
    heatingStatus = val === "Heating" ? "Heating" : "Idle";
  }
  if (log?.CoolingDown) {
    const cooling = readBool(block, log.CoolingDown.p, log.CoolingDown.b ?? 0);
    if (cooling) heatingStatus = "Cooling";
  }

  // Read pumps
  const pumps: { id: string; active: boolean; mode: string | null }[] = [];
  const pumpKeys = ["P1", "P2", "P3", "P4", "P5"];
  for (const key of pumpKeys) {
    const acc = log?.[key];
    if (acc) {
      const val = readEnum(block, acc.p, acc.b, acc.o);
      pumps.push({
        id: key,
        active: val !== "OFF" && val !== "",
        mode: val || null,
      });
    }
  }

  // Read lights
  const lights: { id: string; active: boolean }[] = [];
  const lightAcc = log?.LI;
  if (lightAcc) {
    const val = readEnum(block, lightAcc.p, lightAcc.b, lightAcc.o);
    lights.push({ id: "LI", active: val !== "OFF" && val !== "" });
  }
  const l120Acc = log?.L120;
  if (l120Acc) {
    const val = readEnum(block, l120Acc.p, l120Acc.b, l120Acc.o);
    lights.push({ id: "L120", active: val !== "OFF" && val !== "" });
  }

  // Read watercare (from config if available)
  const watercare: string | null = null;

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
    lights,
    watercare,
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

/**
 * Run a step-by-step connection diagnostic against a Gecko device.
 * Returns detailed results for each protocol phase.
 */
export async function diagnoseSpa(host: string): Promise<DiagnosticResult> {
  const steps: DiagnosticStep[] = [];
  const transport = new UdpTransport();

  // Step 1: Open UDP socket
  let t0 = Date.now();
  try {
    await transport.open();
    steps.push({ step: "udp_socket", status: "ok", detail: "UDP-Socket geöffnet", durationMs: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "udp_socket", status: "fail", detail: `Socket-Fehler: ${err instanceof Error ? err.message : err}`, durationMs: Date.now() - t0 });
    return { host, steps, success: false };
  }

  // Step 2: Send HELLO (unicast + broadcast), wait for response
  t0 = Date.now();
  const clientId = generateClientId();
  const helloData = wrapXml("HELLO", Buffer.from("1"));
  const helloPacket = buildPacket(clientId, "", helloData);

  let helloResponse: string | null = null;
  let responseSource: string | null = null;

  try {
    const result = await new Promise<{ text: string; from: string } | null>((resolve) => {
      const timer = setTimeout(() => {
        transport.removeHandler(handler);
        resolve(null);
      }, 10_000);

      const handler: MessageHandler = (msg, rinfo) => {
        const parsed = parsePacket(msg);
        if (!parsed) return;
        const content = unwrapXml("HELLO", parsed.data);
        if (!content) return;
        const text = content.toString(MESSAGE_ENCODING);
        if (text === "1" || text.startsWith("IOS") || text.startsWith("AND")) return;
        clearTimeout(timer);
        transport.removeHandler(handler);
        resolve({ text, from: rinfo.address });
      };

      transport.addHandler(handler);

      // Send to both unicast and broadcast
      const targets = [host, "255.255.255.255"];
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          for (const addr of targets) {
            try { transport.send(helloPacket, INTOUCH2_PORT, addr); } catch { /* */ }
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
        detail: `Keine Antwort nach 10s (UDP-Port ${INTOUCH2_PORT}). Gerät nicht erreichbar oder falsches Netzwerk-Segment.`,
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

  // Step 3: Try AVERS (version exchange)
  const spaId = helloResponse!.split("|")[0];
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
