import { eecpProtocol } from './eecp-protocol.js';

describe('eecpProtocol', () => {
  it('should work', () => {
    expect(eecpProtocol()).toEqual('eecp-protocol');
  });
});
