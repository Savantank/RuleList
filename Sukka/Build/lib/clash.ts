import picocolors from 'picocolors';
import { domainWildCardToRegex } from './misc';
import { isProbablyIpv4, isProbablyIpv6 } from './is-fast-ip';

const identity = <T>(x: T): T => x;
const unsupported = Symbol('unsupported');

// https://dreamacro.github.io/clash/configuration/rules.html
const PROCESSOR: Record<string, ((raw: string, type: string, value: string) => string) | typeof unsupported> = {
  DOMAIN: identity,
  'DOMAIN-SUFFIX': identity,
  'DOMAIN-KEYWORD': identity,
  'DOMAIN-WILDCARD': (_raw, _type, value) => `DOMAIN-REGEX,${domainWildCardToRegex(value)}`,
  GEOIP: identity,
  'IP-CIDR': identity,
  'IP-CIDR6': identity,
  'IP-ASN': identity,
  'SRC-IP': (_raw, _type, value) => {
    if (value.includes('/')) {
      return `SRC-IP-CIDR,${value}`;
    }
    if (isProbablyIpv4(value)) {
      return `SRC-IP-CIDR,${value}/32`;
    }
    if (isProbablyIpv6(value)) {
      return `SRC-IP-CIDR6,${value}/128`;
    }
    return '';
  },
  'SRC-IP-CIDR': identity,
  'SRC-PORT': identity,
  'DST-PORT': identity,
  'PROCESS-NAME': (_raw, _type, value) => ((value.includes('/') || value.includes('\\')) ? `PROCESS-PATH,${value}` : `PROCESS-NAME,${value}`),
  'DEST-PORT': (_raw, _type, value) => `DST-PORT,${value}`,
  'IN-PORT': (_raw, _type, value) => `SRC-PORT,${value}`,
  'URL-REGEX': unsupported,
  'USER-AGENT': unsupported
};

export const surgeRulesetToClashClassicalTextRuleset = (rules: string[] | Set<string>) => {
  return Array.from(rules).reduce<string[]>((acc, cur) => {
    let buf = '';
    let type = '';
    let i = 0;
    for (const len = cur.length; i < len; i++) {
      if (cur[i] === ',') {
        type = buf;
        break;
      }
      buf += cur[i];
    }
    if (type === '') {
      return acc;
    }
    const value = cur.slice(i + 1);
    if (type in PROCESSOR) {
      const proc = PROCESSOR[type];
      if (proc !== unsupported) {
        acc.push(proc(cur, type, value));
      }
    } else {
      console.log(picocolors.yellow(`[clash] unknown rule type: ${type}`), cur);
    }
    return acc;
  }, []);
};

export const surgeDomainsetToClashDomainset = (domainset: string[]) => {
  return domainset.map(i => (i[0] === '.' ? `+${i}` : i));
};

export const surgeDomainsetToClashRuleset = (domainset: string[]) => {
  return domainset.map(i => (i[0] === '.' ? `DOMAIN-SUFFIX,${i.slice(1)}` : `DOMAIN,${i}`));
};
