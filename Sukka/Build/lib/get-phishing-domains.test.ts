import { describe, it } from 'mocha';

import { calcDomainAbuseScore } from './get-phishing-domains';

describe('sortDomains', () => {
  it('nmdj.pl', () => {
    console.log(calcDomainAbuseScore('.01462ccca801fed55370d79231c876e5.nmdj.pl', '.01462ccca801fed55370d79231c876e5', false));
  });
});
