import { ledgerGetAccount } from '../../../src/ledger/key';
import fixture from '../../fixtures/ledger/key.data';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import AvalancheApp from '@avalabs/hw-app-avalanche';

jest.mock('@avalabs/hw-app-avalanche');
jest.mock('@ledgerhq/hw-transport-node-hid');
describe('ledger/key Testcases', () => {
  beforeEach(() => {
    // Reset mock function calls before each test
    jest.clearAllMocks();
  });
  describe('ledgerGetAccount Testcases', () => {
    test('Should throw error for invalid path', async () => {
      try {
        const mockGetAddressAndPubKey = jest.fn().mockResolvedValue({
          errorMessage: 'Invalid Path',
          returnCode: 0,
          publicKey: Buffer.from(fixture.input.publicKey),
          address: fixture.input.address
        });
        //@ts-ignore
        AvalancheApp.mockImplementation(() => ({
          getAddressAndPubKey: mockGetAddressAndPubKey
        }));
        const mockTransport = {
          close: jest.fn()
        };
        //@ts-ignore
        TransportNodeHid.open.mockResolvedValue(mockTransport);

        const result = await ledgerGetAccount(fixture.invalidPath.path, fixture.input.hrp);
      } catch (error) {
        expect(error).not.toBeNull;
      }
    });

    test("Should get account info", async () => {
        try {
            const mockGetAddressAndPubKey = jest.fn().mockResolvedValue({
              errorMessage: 'No errors',
              returnCode: 0,
              publicKey: Buffer.from(fixture.input.publicKey),
              address: fixture.input.address
            });
            //@ts-ignore
            AvalancheApp.mockImplementation(() => ({
              getAddressAndPubKey: mockGetAddressAndPubKey
            }));
            const mockTransport = {
              close: jest.fn()
            };
            //@ts-ignore
            TransportNodeHid.open.mockResolvedValue(mockTransport);

            const result = await ledgerGetAccount(fixture.validPath.path, fixture.input.hrp);
            expect(result).not.toBeNull
            expect(result).toHaveProperty("publicKey")
            expect(result).toHaveProperty("address")
          } catch (error) {
            expect(error).toBeNull;
          }
    })
  });
});
