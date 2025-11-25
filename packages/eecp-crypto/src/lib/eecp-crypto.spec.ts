import { eecpCrypto } from './eecp-crypto.js';

describe('eecpCrypto', () => {
  it('should work', () => {
    expect(eecpCrypto()).toEqual('eecp-crypto');
  });
});
