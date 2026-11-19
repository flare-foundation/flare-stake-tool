/**
 * `info balance`: the P-chain balance is added up from the account's UTXOs
 * (`platform.getUTXOs`), as `platform.getBalance` added it up before avalanchego
 * 1.15.4 removed it, but exact also above the uint64 maximum, where getBalance
 * stopped counting.
 */
import { BigIntPr, Id, Int, OutputOwners, TransferOutput, Utxo, avaxSerial, pvmSerial } from "@flarenetwork/flarejs";
import { expect } from "chai";
import { getBalances, pChainBalance } from "../../src/app/info";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { UTXO_PAGE_SIZE } from "../../src/core/builders/pchain";
import type { Env } from "../../src/core/types";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const ACCOUNT = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
/** Another owner's address bytes, for a co-owned UTXO. */
const OTHER_OWNER = new Uint8Array(20).fill(0x11);
/** localflare's FLR asset id, as the recorded fixtures have it. */
const FLR = "QJx3BomP9MGxCy5RPVXyNUeEqzduvuNbxQVXMuPKDakacdY6K";
const OTHER_ASSET = Id.fromHex(`0x${"ab".repeat(32)}`).toString();
const IN_A_DAY = BigInt(Math.floor(Date.now() / 1000) + 86_400);

const owners = (addresses: Uint8Array[], threshold = 1, locktime = 0n) =>
  OutputOwners.fromNative(addresses, locktime, threshold);
const utxoId = (index: number) =>
  new avaxSerial.UTXOID(Id.fromHex(`0x${(index + 1).toString(16).padStart(64, "0")}`), new Int(0));
const plain = (index: number, amount: bigint, outputOwners = owners([ACCOUNT.addressBytes]), assetId = FLR) =>
  new Utxo(utxoId(index), Id.fromString(assetId), new TransferOutput(new BigIntPr(amount), outputOwners));
const stakeableLocked = (index: number, amount: bigint, lockTime: bigint) =>
  new Utxo(
    utxoId(index),
    Id.fromString(FLR),
    new pvmSerial.StakeableLockOut(
      new BigIntPr(lockTime),
      new TransferOutput(new BigIntPr(amount), owners([ACCOUNT.addressBytes]))
    )
  );

describe("app/info: the P-chain balance from the account's UTXOs", () => {
  it("counts every FLR UTXO the address owns, alone or with others, locked or not, as platform.getBalance did", () => {
    const utxos = [
      plain(0, 1_000_000_000n), // unlocked
      plain(1, 20_000_000_000n, owners([ACCOUNT.addressBytes], 1, IN_A_DAY)), // lockedNotStakeable
      stakeableLocked(2, 300_000_000_000n, IN_A_DAY), // lockedStakeable
      stakeableLocked(3, 4_000_000_000_000n, 1n), // its stakeable lock has ended: unlocked
      plain(4, 50_000_000_000_000n, owners([ACCOUNT.addressBytes, OTHER_OWNER], 2)), // co-owned 2-of-2
    ];
    expect(pChainBalance(utxos, FLR)).to.equal(54_321_000_000_000n);
  });

  it("adds up the exact total above the uint64 maximum, where platform.getBalance stopped counting", () => {
    const utxos = [plain(0, 10_000_000_000_000_000_000n), plain(1, 10_000_000_000_000_000_000n)];
    expect(pChainBalance(utxos, FLR)).to.equal(20_000_000_000_000_000_000n); // getBalance: 18446744073709551615
  });

  it("leaves out UTXOs of another asset", () => {
    const utxos = [plain(0, 7_000_000_000n), plain(1, 99_000_000_000n, undefined, OTHER_ASSET)];
    expect(pChainBalance(utxos, FLR)).to.equal(7_000_000_000n);
    expect(pChainBalance([], FLR)).to.equal(0n);
  });

  it("follows getUTXOs past a full page, which platform.getBalance did not need", async () => {
    const firstPage = Array.from({ length: UTXO_PAGE_SIZE }, (_, i) => plain(i, 1_000_000_000n));
    const lastPage = [plain(UTXO_PAGE_SIZE, 5_000_000_000n), plain(UTXO_PAGE_SIZE + 1, 6_000_000_000n)];
    const endOfFirst = { address: ACCOUNT.pAddress, utxo: "end-of-the-first-page" };
    const queries: unknown[] = [];
    const env = {
      network: networkConfig("localflare", {}),
      clients: {
        verifyNetwork: () => Promise.resolve(),
        context: () => Promise.resolve({ avaxAssetID: FLR }),
        provider: { getBalance: () => Promise.resolve(123n) },
        pvm: {
          getUTXOs: (query: { startIndex?: unknown }) => {
            queries.push(query);
            const page = query.startIndex === undefined ? firstPage : lastPage;
            return Promise.resolve({ numFetched: String(page.length), utxos: page, endIndex: endOfFirst });
          },
        },
      },
    } as unknown as Env;

    const balances = await getBalances(env, ACCOUNT);

    expect(queries).to.deep.equal([
      { addresses: [ACCOUNT.pAddress] },
      { addresses: [ACCOUNT.pAddress], startIndex: endOfFirst },
    ]);
    expect(balances).to.deep.equal({ cChainWei: 123n, pChainNFlr: 1_035_000_000_000n });
  });
});
