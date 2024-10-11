import { task } from './trace';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { OUTPUT_MOCK_DIR } from './constants/dir';
import { mkdirp } from './lib/misc';
import { $fetch } from './lib/make-fetch-happen';

const ASSETS_LIST = {
  'www-google-analytics-com_ga.js': 'https://raw.githubusercontent.com/AdguardTeam/Scriptlets/master/dist/redirect-files/google-analytics-ga.js',
  'www-googletagservices-com_gpt.js': 'https://raw.githubusercontent.com/AdguardTeam/Scriptlets/master/dist/redirect-files/googletagservices-gpt.js',
  'www-google-analytics-com_analytics.js': 'https://raw.githubusercontent.com/AdguardTeam/Scriptlets/master/dist/redirect-files/google-analytics.js',
  'www-googlesyndication-com_adsbygoogle.js': 'https://raw.githubusercontent.com/AdguardTeam/Scriptlets/master/dist/redirect-files/googlesyndication-adsbygoogle.js',
  'amazon-adsystem-com_amazon-apstag.js': 'https://raw.githubusercontent.com/AdguardTeam/Scriptlets/master/dist/redirect-files/amazon-apstag.js'
} as const;

export const downloadMockAssets = task(require.main === module, __filename)((span) => Promise.all(Object.entries(ASSETS_LIST).map(
  ([filename, url]) => span
    .traceChildAsync(url, async () => {
      const res = await $fetch(url);
      if (!res.body) {
        throw new Error(`Empty body from ${url}`);
      }

      await mkdirp(OUTPUT_MOCK_DIR);
      const src = path.join(OUTPUT_MOCK_DIR, filename);

      return pipeline(
        res.body,
        fs.createWriteStream(src, 'utf-8')
      );
    })
)));
