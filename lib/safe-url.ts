/**
 * SSRF-safe external endpoint validation (server-only).
 *
 * The BYOK feature lets users point the app at any OpenAI-compatible
 * endpoint. Because the URL is fetched from the server, we must make sure
 * it cannot be abused to probe internal / private network resources.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export class ExternalUrlError extends Error {}

export class RequestValidationError extends Error {}

/* --------------------------- IP range checks --------------------------- */

function v4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = parseInt(part, 10);
    if (n > 255) return null;
    result = result * 256 + n;
  }
  return result >>> 0;
}

function v4InRange(ip: string, cidr: [string, number]): boolean {
  const value = v4ToNumber(ip);
  const [base, bits] = cidr;
  const baseValue = v4ToNumber(base);
  if (value === null || baseValue === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

const BLOCKED_V4_CIDRS: Array<[string, number]> = [
  ['0.0.0.0', 8],         // "this" network
  ['10.0.0.0', 8],        // RFC1918
  ['100.64.0.0', 10],     // CGNAT
  ['127.0.0.0', 8],       // loopback
  ['169.254.0.0', 16],    // link-local (cloud metadata!)
  ['172.16.0.0', 12],     // RFC1918
  ['192.0.0.0', 24],      // IETF protocol assignments
  ['192.0.2.0', 24],      // TEST-NET-1
  ['192.88.99.0', 24],    // 6to4 relay anycast
  ['192.168.0.0', 16],    // RFC1918
  ['198.18.0.0', 15],     // benchmarking
  ['198.51.100.0', 24],   // TEST-NET-2
  ['203.0.113.0', 24],    // TEST-NET-3
  ['224.0.0.0', 4],       // multicast
  ['240.0.0.0', 4],       // reserved / future
  ['255.255.255.255', 32] // broadcast
];

function isBlockedV4(ip: string): boolean {
  return BLOCKED_V4_CIDRS.some(([base, bits]) => v4InRange(ip, [base, bits]));
}

/** Expands an IPv6 literal into its 8 16-bit groups. */
function expandV6(ip: string): number[] | null {
  let addr = ip;
  const zoneIndex = addr.indexOf('%');
  if (zoneIndex !== -1) addr = addr.slice(0, zoneIndex);
  if (addr.includes(':::')) return null;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] => {
    if (half === '') return [];
    const parts = half.split(':');
    const out: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      const g = parts[i];
      if (g.includes('.')) {
        // Dotted-quad tail (IPv4-mapped notation), must be the final group
        if (i !== parts.length - 1) return [NaN];
        const v4 = g.split('.');
        if (v4.length !== 4) return [NaN];
        let hi = 0;
        let lo = 0;
        for (let k = 0; k < 4; k++) {
          const p = v4[k];
          if (!/^(0|[1-9]\d{0,2})$/.test(p)) return [NaN];
          const n = parseInt(p, 10);
          if (n > 255) return [NaN];
          if (k < 2) hi = hi * 256 + n;
          else lo = lo * 256 + n;
        }
        out.push(hi, lo);
      } else if (/^[0-9a-fA-F]{1,4}$/.test(g)) {
        out.push(parseInt(g, 16));
      } else {
        return [NaN];
      }
    }
    return out;
  };
  const head = parseHalf(halves[0]);
  const tail = halves.length === 2 ? parseHalf(halves[1]) : null;
  if (head.some((n) => Number.isNaN(n)) || (tail && tail.some((n) => Number.isNaN(n)))) return null;
  if (tail !== null) {
    if (head.length + tail.length > 7) return null;
    const fill = new Array(8 - head.length - tail.length).fill(0);
    return [...head, ...fill, ...tail];
  }
  if (head.length !== 8) return null;
  return head;
}

function v6MatchesPrefix(groups: number[], prefixGroups: number[], bits: number): boolean {
  const fullGroups = Math.floor(bits / 16);
  const partialBits = bits % 16;
  for (let i = 0; i < fullGroups; i++) {
    if (groups[i] !== prefixGroups[i]) return false;
  }
  if (partialBits > 0) {
    const shift = 16 - partialBits;
    if ((groups[fullGroups] >>> shift) !== (prefixGroups[fullGroups] >>> shift)) return false;
  }
  return true;
}

const BLOCKED_V6_PREFIXES: Array<[string, number]> = [
  ['::', 128],          // unspecified
  ['::1', 128],         // loopback
  ['::ffff:0:0', 96],   // IPv4-mapped (checked as v4 below)
  ['64:ff9b::', 96],    // NAT64
  ['100::', 64],        // discard-only
  ['2001:db8::', 32],   // documentation
  ['fc00::', 7],        // unique local
  ['fe80::', 10],       // link-local
  ['ff00::', 8]         // multicast
];

function isBlockedV6(ip: string): boolean {
  const groups = expandV6(ip);
  if (!groups) return true; // unparseable => block
  for (const [prefix, bits] of BLOCKED_V6_PREFIXES) {
    if (!v6MatchesPrefix(groups, expandV6(prefix)!, bits)) continue;
    if (prefix === '::ffff:0:0') {
      const v4 = `${groups[6] >>> 8}.${groups[6] & 255}.${groups[7] >>> 8}.${groups[7] & 255}`;
      return isBlockedV4(v4);
    }
    return true;
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedV4(ip);
  if (net.isIPv6(ip)) return isBlockedV6(ip);
  return true; // unparseable => block
}

/* --------------------------- URL validation --------------------------- */

type UrlCheckResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Validates that an external endpoint URL is safe for the server to fetch:
 * http/https only, resolvable, and not pointing at private/internal ranges.
 */
export async function validateExternalBaseUrl(
  baseUrl: string,
  options?: { timeoutMs?: number }
): Promise<UrlCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    return {
      ok: false,
      error: 'Invalid Base URL. Please provide a full http(s) endpoint, e.g. https://api.openai.com/v1'
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: `Protocol "${parsed.protocol}" is not allowed. Only http/https endpoints are supported.`
    };
  }

  let host = parsed.hostname;
  if (!host) {
    return { ok: false, error: 'Base URL is missing a hostname.' };
  }
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  if (net.isIP(host)) {
    if (isBlockedIp(host)) {
      return { ok: false, error: 'Endpoints on private/internal network addresses are not allowed.' };
    }
    return { ok: true, url: baseUrl.trim() };
  }

  if (
    /^(localhost|.*\.local|.*\.internal|metadata\.(googleapis\.com|azure\.com|amazonaws\.com))$/i.test(host)
  ) {
    return { ok: false, error: 'Endpoints on private/internal network addresses are not allowed.' };
  }

  try {
    const results = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS lookup timed out')), options?.timeoutMs ?? 5000).unref()
      )
    ]);
    if (!results || results.length === 0) {
      return { ok: false, error: `Could not resolve host "${host}".` };
    }
    for (const { address } of results) {
      if (isBlockedIp(address)) {
        return { ok: false, error: 'Endpoints on private/internal network addresses are not allowed.' };
      }
    }
    return { ok: true, url: baseUrl.trim() };
  } catch {
    return { ok: false, error: `Could not resolve host "${host}".` };
  }
}
