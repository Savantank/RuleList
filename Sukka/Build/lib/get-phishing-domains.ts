import { processDomainLists, processHosts } from './parse-filter';
import * as tldts from 'tldts-experimental';

import { dummySpan } from '../trace';
import type { Span } from '../trace';
import { appendArrayInPlaceCurried } from './append-array-in-place';
import { PHISHING_DOMAIN_LISTS_EXTRA, PHISHING_HOSTS_EXTRA } from '../constants/reject-data-source';
import { loosTldOptWithPrivateDomains } from '../constants/loose-tldts-opt';
import picocolors from 'picocolors';
import createKeywordFilter from './aho-corasick';
import { createCacheKey, deserializeArray, serializeArray } from './cache-filesystem';
import { cache } from './fs-memo';

const BLACK_TLD = new Set([
  'accountant', 'art', 'autos',
  'bar', 'beauty', 'bid', 'bio', 'biz', 'bond', 'business', 'buzz',
  'cc', 'cf', 'cfd', 'click', 'cloud', 'club', 'cn', 'codes',
  'co.uk', 'co.in', 'com.br', 'com.cn', 'com.pl', 'com.vn',
  'cool', 'cricket', 'cyou',
  'date', 'design', 'digital', 'download',
  'faith', 'fit', 'fun',
  'ga', 'gd', 'gives', 'gq', 'group', 'host',
  'icu', 'id', 'info', 'ink',
  'lat', 'life', 'live', 'link', 'loan', 'lol', 'ltd',
  'me', 'men', 'ml', 'mobi', 'mom', 'monster',
  'net.pl',
  'one', 'online',
  'party', 'pro', 'pl', 'pw',
  'racing', 'rest', 'review', 'rf.gd',
  'sa.com', 'sbs', 'science', 'shop', 'site', 'skin', 'space', 'store', 'stream', 'su', 'surf',
  'tech', 'tk', 'tokyo', 'top', 'trade',
  'vip', 'vn',
  'webcam', 'website', 'win',
  'xyz',
  'za.com'
]);

const WHITELIST_MAIN_DOMAINS = new Set([
  // 'w3s.link', // ipfs gateway
  // 'dweb.link', // ipfs gateway
  // 'nftstorage.link', // ipfs gateway
  'fleek.cool', // ipfs gateway
  'business.site', // Drag'n'Drop site building platform
  'page.link', // Firebase URL Shortener
  // 'notion.site',
  // 'vercel.app',
  'gitbook.io',
  'zendesk.com'
]);

const leathalKeywords = createKeywordFilter([
  'vinted-',
  'inpost-pl',
  'vlnted-'
]);

const sensitiveKeywords = createKeywordFilter([
  '.amazon-',
  '-amazon',
  'fb-com',
  'facebook-com',
  '-facebook',
  'facebook-',
  'focebaak',
  '.facebook.',
  'metamask-',
  '-metamask',
  'www.apple',
  '-coinbase',
  'coinbase-',
  'booking-com',
  'booking.com-',
  'booking-eu',
  'vinted-',
  'inpost-pl',
  'login.microsoft',
  'login-microsoft',
  'microsoftonline',
  'google.com-',
  'minecraft',
  'staemco',
  'oferta'
]);
const lowKeywords = createKeywordFilter([
  'transactions-',
  'payment-',
  '-transactions',
  '-payment',
  '-faceb', // facebook fake
  '.faceb', // facebook fake
  'facebook',
  'virus-',
  'icloud-',
  'apple-',
  '-roblox',
  '-co-jp',
  'customer.',
  'customer-',
  '.www-',
  '.www.',
  '.www2',
  'instagram',
  'microsof',
  'passwordreset',
  '.google-',
  'recover',
  'banking'
]);

const cacheKey = createCacheKey(__filename);

const processPhihsingDomains = cache(function processPhihsingDomains(domainArr: string[]): Promise<string[]> {
  const domainCountMap: Record<string, number> = {};
  const domainScoreMap: Record<string, number> = {};

  for (let i = 0, len = domainArr.length; i < len; i++) {
    const line = domainArr[i];

    const {
      publicSuffix: tld,
      domain: apexDomain,
      subdomain,
      isPrivate
    } = tldts.parse(line, loosTldOptWithPrivateDomains);

    if (isPrivate) {
      continue;
    }

    if (!tld) {
      console.log(picocolors.yellow('[phishing domains] E0001'), 'missing tld', { line, tld });
      continue;
    }
    if (!apexDomain) {
      console.log(picocolors.yellow('[phishing domains] E0002'), 'missing domain', { line, apexDomain });
      continue;
    }

    domainCountMap[apexDomain] ||= 0;
    domainCountMap[apexDomain] += 1;

    if (!(apexDomain in domainScoreMap)) {
      domainScoreMap[apexDomain] = 0;
      if (BLACK_TLD.has(tld)) {
        domainScoreMap[apexDomain] += 4;
      } else if (tld.length > 6) {
        domainScoreMap[apexDomain] += 2;
      }
      if (apexDomain.length >= 18) {
        domainScoreMap[apexDomain] += 0.5;
      }
    }
    if (
      subdomain
      && !WHITELIST_MAIN_DOMAINS.has(apexDomain)
    ) {
      domainScoreMap[apexDomain] += calcDomainAbuseScore(subdomain, line);
    }
  }

  for (const apexDomain in domainCountMap) {
    if (
      // !WHITELIST_MAIN_DOMAINS.has(apexDomain)
      (domainScoreMap[apexDomain] >= 24)
      || (domainScoreMap[apexDomain] >= 16 && domainCountMap[apexDomain] >= 7)
      || (domainScoreMap[apexDomain] >= 13 && domainCountMap[apexDomain] >= 11)
      || (domainScoreMap[apexDomain] >= 5 && domainCountMap[apexDomain] >= 14)
      || (domainScoreMap[apexDomain] >= 3 && domainCountMap[apexDomain] >= 20)
    ) {
      domainArr.push('.' + apexDomain);
    }
  }

  return Promise.resolve(domainArr);
}, {
  serializer: serializeArray,
  deserializer: deserializeArray
});

export function getPhishingDomains(parentSpan: Span) {
  return parentSpan.traceChild('get phishing domains').traceAsyncFn(async (span) => {
    const domainArr = await span.traceChildAsync('download/parse/merge phishing domains', async (curSpan) => {
      const domainArr: string[] = [];

      await Promise.all([
        ...PHISHING_DOMAIN_LISTS_EXTRA.map(entry => processDomainLists(curSpan, ...entry, cacheKey)),
        ...PHISHING_HOSTS_EXTRA.map(entry => processHosts(curSpan, ...entry, cacheKey))
      ]).then(domainGroups => domainGroups.forEach(appendArrayInPlaceCurried(domainArr)));

      return domainArr;
    });

    return span.traceChildAsync(
      'process phishing domain set',
      () => processPhihsingDomains(domainArr)
    );
  });
}

export function calcDomainAbuseScore(subdomain: string, fullDomain: string = subdomain) {
  if (leathalKeywords(fullDomain)) {
    return 100;
  }

  let weight = 0;

  const hitLowKeywords = lowKeywords(fullDomain);
  const sensitiveKeywordsHit = sensitiveKeywords(fullDomain);

  if (sensitiveKeywordsHit) {
    weight += 9;
    if (hitLowKeywords) {
      weight += 5;
    }
  } else if (hitLowKeywords) {
    weight += 1.5;
  }

  const subdomainLength = subdomain.length;

  if (subdomainLength > 13) {
    weight += 0.2;
    if (subdomainLength > 20) {
      weight += 1;
      if (subdomainLength > 30) {
        weight += 5;
        if (subdomainLength > 40) {
          weight += 10;
        }
      }
    }

    if (subdomain.slice(1).includes('.')) {
      weight += 1;
      if (subdomain.includes('www.')) {
        weight += 1;
      }
    }
  }

  return weight;
}

if (require.main === module) {
  getPhishingDomains(dummySpan)
    .catch(console.error);
}
