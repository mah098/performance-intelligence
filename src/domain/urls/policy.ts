import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function parseIpv6(hostname: string): number[] | null {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) !== 6 || host.includes("%")) return null;

  const halves = host.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (part: string) => (part ? part.split(":").map((chunk) => Number.parseInt(chunk, 16)) : []);
  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  const zeros = halves.length === 2 ? 8 - left.length - right.length : 0;
  const words = [...left, ...Array(Math.max(zeros, 0)).fill(0), ...right];
  return words.length === 8 && words.every((word) => Number.isInteger(word) && word >= 0 && word <= 0xffff)
    ? words
    : null;
}

function isPublicIpv4(host: string): boolean {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [a = 0, b = 0] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 0 && octets[2] === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0 && octets[2] === 113) return false;
  return true;
}

function isPublicIpv6(hostname: string): boolean {
  const words = parseIpv6(hostname);
  if (!words) return false;
  const [first = 0, second = 0, third = 0, fourth = 0] = words;
  if (words.every((word) => word === 0)) return false;
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return false;
  if ((first & 0xfe00) === 0xfc00) return false; // Unique local.
  if ((first & 0xffc0) === 0xfe80) return false; // Link local.
  if ((first & 0xff00) === 0xff00) return false; // Multicast.
  if (first === 0x2001 && (second & 0xfff0) === 0x0010) return false; // Benchmarking.
  if (first === 0x2001 && second === 0x0db8) return false; // Documentation.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const v4 = `${(words[6] ?? 0) >> 8}.${(words[6] ?? 0) & 255}.${(words[7] ?? 0) >> 8}.${(words[7] ?? 0) & 255}`;
    return isPublicIpv4(v4);
  }
  if (first === 0x0064 && second === 0xff9b && third === 0 && fourth === 0) return false; // Well-known NAT64 prefix.
  return first >= 0x2000 && first <= 0x3fff;
}

export function canonicalizePublicHttpsUrl(input: string): string {
  if (input.length > 2048) throw new UnsafeUrlError("URL exceeds 2048 characters.");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UnsafeUrlError("Enter a complete valid URL.");
  }

  if (url.protocol !== "https:") throw new UnsafeUrlError("Only HTTPS URLs are supported.");
  if (url.username || url.password) throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("Only the standard HTTPS port is allowed.");
  if (url.hash) url.hash = "";

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Local and internal hosts cannot be monitored.");
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4 && !isPublicIpv4(host)) throw new UnsafeUrlError("Private or reserved IP addresses cannot be monitored.");
  if (ipVersion === 6 && !isPublicIpv6(url.hostname)) throw new UnsafeUrlError("Private or reserved IP addresses cannot be monitored.");
  if (!ipVersion && (!host.includes(".") || host.endsWith(".test") || host.endsWith(".invalid"))) {
    throw new UnsafeUrlError("Use a public internet hostname.");
  }

  url.hostname = host;
  url.searchParams.sort();
  return url.toString();
}
