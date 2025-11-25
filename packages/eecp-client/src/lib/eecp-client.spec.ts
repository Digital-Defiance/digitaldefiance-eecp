import { eecpClient } from './eecp-client.js';

describe('eecpClient', () => {
  it('should work', () => {
    expect(eecpClient()).toEqual('eecp-client');
  });
});
