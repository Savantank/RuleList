import { TTL, deserializeArray, fsFetchCache, serializeArray, createCacheKey } from './cache-filesystem';
import { defaultRequestInit, fetchWithRetry } from './fetch-retry';
import { createMemoizedPromise } from './memo-promise';

const cacheKey = createCacheKey(__filename);

export const getPublicSuffixListTextPromise = createMemoizedPromise(() => fsFetchCache.apply(
  cacheKey('https://publicsuffix.org/list/public_suffix_list.dat'),
  () => fetchWithRetry('https://publicsuffix.org/list/public_suffix_list.dat', defaultRequestInit)
    .then(r => r.text()).then(text => text.split('\n')),
  {
    // https://github.com/publicsuffix/list/blob/master/.github/workflows/tld-update.yml
    // Though the action runs every 24 hours, the IANA list is updated every 7 days.
    // So a 3 day TTL should be enough.
    ttl: TTL.THREE_DAYS(),
    serializer: serializeArray,
    deserializer: deserializeArray
  }
));
