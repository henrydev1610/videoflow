import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export class SourcePolicyError extends Error {
  constructor(public readonly code: 'INVALID_URL' | 'SOURCE_BLOCKED') {
    super(code);
  }
}
export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      return false;
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function parseSourceUrl(
  input: string,
  allowlist: readonly string[] = [],
): URL {
  if (
    input.length > 2048 ||
    input !== input.trim() ||
    /[\u0000-\u0020\\]/u.test(input)
  )
    throw new SourcePolicyError('INVALID_URL');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SourcePolicyError('INVALID_URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new SourcePolicyError('INVALID_URL');
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (
    !host ||
    (allowlist.length && !allowlist.map((h) => h.toLowerCase()).includes(host))
  )
    throw new SourcePolicyError('SOURCE_BLOCKED');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'host.docker.internal' ||
    host.endsWith('.local') ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new SourcePolicyError('SOURCE_BLOCKED');
  url.hash = '';
  return url;
}
export type Resolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;
export async function resolveSource(
  input: string,
  allowlist: readonly string[] = [],
  resolver: Resolver = (hostname) =>
    lookup(hostname, { all: true, verbatim: true }),
) {
  const url = parseSourceUrl(input, allowlist);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: Awaited<ReturnType<Resolver>>;
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await resolver(hostname);
  } catch {
    throw new SourcePolicyError('SOURCE_BLOCKED');
  }
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new SourcePolicyError('SOURCE_BLOCKED');
  return { url, hostname, addresses };
}
