/**
 * The default gas limit of `claim` and `withdrawal` follows the recipient: an
 * ordinary account gets the low limits, an address with contract code (a smart
 * contract wallet, a Personal Delegation Account that wraps what it receives)
 * the larger limits of 4.4.0. `--gas-limit` replaces the default, and the
 * recipient is then not looked up. Also what the builders refuse before
 * anything is signed: a claim beyond the unclaimed rewards, a contract the
 * registry does not know, an unregistered claim executor.
 */
import { expect } from "chai";
import { ZeroAddress } from "ethers";
import { contractInterface } from "../../src/chain/contracts";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import {
  CLAIM_WRAP_GAS_LIMIT,
  CONTRACT_RECIPIENT_GAS_LIMIT,
  DEFAULT_GAS_LIMIT,
  resolveEvmFees,
} from "../../src/constants/fees";
import { buildClaim, buildSetClaimExecutors, buildWithdrawal } from "../../src/core/builders/evm";
import type { EvmEnv, UnsignedTxBundle } from "../../src/core/types";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const ACCOUNT = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
const ORDINARY = "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC";
const CONTRACT = "0x3333333333333333333333333333333333333333";
const REWARD_MANAGER = "0x1111111111111111111111111111111111111111";

interface Chain {
  /** Unclaimed rewards of the account (default 4 FLR: 5 earned, 1 claimed). */
  unclaimedWei?: bigint;
  /** What the contract registry answers for every name (default REWARD_MANAGER; ZeroAddress: not deployed). */
  registered?: string;
  /** Registered claim executors and their fees. */
  executors?: Record<string, bigint>;
  /** eth_getCode fails, as with a node that cannot be reached. */
  codeLookupFails?: boolean;
}

/** A C-chain with one contract (CONTRACT) and the given rewards and executors; records the getCode lookups. */
function chainEnv(chain: Chain = {}): { env: EvmEnv; codeLookups: string[] } {
  const codeLookups: string[] = [];
  const selectorOf = (fn: string) => contractInterface.getFunction(fn)!.selector;
  const provider: EvmEnv["clients"]["provider"] = {
    getTransactionCount: () => Promise.resolve(0),
    getCode: (address: string) => {
      codeLookups.push(address);
      if (chain.codeLookupFails) return Promise.reject(new Error("eth_getCode failed"));
      return Promise.resolve(address.toLowerCase() === CONTRACT ? "0x6080604052" : "0x");
    },
    call: ({ data }: { data: string }) => {
      if (data.startsWith(selectorOf("getContractAddressByName"))) {
        const address = chain.registered ?? REWARD_MANAGER;
        return Promise.resolve(contractInterface.encodeFunctionResult("getContractAddressByName", [address]));
      }
      if (data.startsWith(selectorOf("getStateOfRewards"))) {
        const claimed = 10n ** 18n;
        const total = claimed + (chain.unclaimedWei ?? 4n * 10n ** 18n);
        return Promise.resolve(contractInterface.encodeFunctionResult("getStateOfRewards", [total, claimed]));
      }
      if (data.startsWith(selectorOf("getExecutorInfo"))) {
        const [executor] = contractInterface.decodeFunctionData("getExecutorInfo", data) as unknown as [string];
        const fee = chain.executors?.[executor];
        return Promise.resolve(
          contractInterface.encodeFunctionResult("getExecutorInfo", [fee !== undefined, fee ?? 0n])
        );
      }
      return Promise.reject(new Error(`unexpected call ${data.slice(0, 10)}`));
    },
  };
  return { env: { network: networkConfig("localflare", {}), clients: { provider } }, codeLookups };
}

const gasLimitOf = (bundle: UnsignedTxBundle): bigint => {
  if (bundle.kind !== "evm") throw new Error("not an EVM transaction");
  return bundle.tx.gasLimit;
};

describe("core/builders/evm: default gas limit by recipient", () => {
  it("withdrawal: the low limit to an ordinary account, the 4.4.0 limit to a contract", async () => {
    const { env } = chainEnv();
    const withdrawal = (to: string) =>
      buildWithdrawal({ type: "withdrawal", to, amount: 1n, fees: resolveEvmFees("withdrawal") }, env, ACCOUNT);
    expect(gasLimitOf(await withdrawal(ORDINARY))).to.equal(BigInt(DEFAULT_GAS_LIMIT.withdrawal));
    expect(gasLimitOf(await withdrawal(CONTRACT))).to.equal(BigInt(CONTRACT_RECIPIENT_GAS_LIMIT.withdrawal));
  });

  it("claim: the low limit to an ordinary account, the 4.4.0 limit to a contract or when wrapping", async () => {
    const { env, codeLookups } = chainEnv();
    const claim = (recipient: string, wrap: boolean) =>
      buildClaim({ type: "claim", recipient, wrap, fees: resolveEvmFees("claim") }, env, ACCOUNT);
    expect(gasLimitOf(await claim(ORDINARY, false))).to.equal(BigInt(DEFAULT_GAS_LIMIT.claim));
    expect(gasLimitOf(await claim(CONTRACT, false))).to.equal(BigInt(CONTRACT_RECIPIENT_GAS_LIMIT.claim));
    const lookups = codeLookups.length;
    expect(gasLimitOf(await claim(ORDINARY, true))).to.equal(BigInt(CLAIM_WRAP_GAS_LIMIT));
    expect(codeLookups.length, "wrapping needs no recipient lookup").to.equal(lookups);
  });

  it("uses --gas-limit as given and then does not look the recipient up", async () => {
    const { env, codeLookups } = chainEnv();
    const fees = resolveEvmFees("claim", { gasLimit: "450000" });
    const bundle = await buildClaim({ type: "claim", recipient: CONTRACT, wrap: false, fees }, env, ACCOUNT);
    expect(gasLimitOf(bundle)).to.equal(450_000n);
    const withdrawal = await buildWithdrawal(
      { type: "withdrawal", to: ORDINARY, amount: 1n, fees: resolveEvmFees("withdrawal", { gasLimit: "70000" }) },
      env,
      ACCOUNT
    );
    expect(gasLimitOf(withdrawal)).to.equal(70_000n);
    expect(codeLookups).to.deep.equal([]);
  });
});

describe("core/builders/evm: refusals before anything is signed", () => {
  const claim = (env: EvmEnv, amount?: bigint) =>
    buildClaim(
      { type: "claim", recipient: ORDINARY, wrap: false, fees: resolveEvmFees("claim"), amount },
      env,
      ACCOUNT
    );

  it("claim: refuses more than the unclaimed rewards, zero, and a claim when nothing is unclaimed", async () => {
    const refusal = (trying: string, unclaimed: string) =>
      `Trying to claim: ${trying} LFLR. Unclaimed rewards: ${unclaimed} LFLR. ` +
      "Amount should be greater than 0 and less than or equal to unclaimed rewards.";
    const fourUnclaimed = chainEnv();
    const noneUnclaimed = chainEnv({ unclaimedWei: 0n });
    for (const [chain, amount, message] of [
      [fourUnclaimed, 5n * 10n ** 18n, refusal("5.0", "4.0")],
      [fourUnclaimed, 0n, refusal("0.0", "4.0")],
      [noneUnclaimed, undefined, refusal("0.0", "0.0")],
    ] as const) {
      await claim(chain.env, amount).then(
        () => expect.fail(`claimed ${String(amount)}`),
        (error: unknown) => expect(String(error)).to.include(message)
      );
    }
    expect(gasLimitOf(await claim(fourUnclaimed.env, 4n * 10n ** 18n))).to.equal(BigInt(DEFAULT_GAS_LIMIT.claim));
  });

  it("refuses a contract the registry does not know (address zero)", async () => {
    await claim(chainEnv({ registered: ZeroAddress }).env).then(
      () => expect.fail("claimed without a reward manager"),
      (error: unknown) => expect(String(error)).to.include("ValidatorRewardManager contract address not found")
    );
  });

  it("fails a claim or withdrawal whose recipient cannot be looked up, rather than guessing its gas limit", async () => {
    const { env, codeLookups } = chainEnv({ codeLookupFails: true });
    const builds = {
      withdrawal: () =>
        buildWithdrawal(
          { type: "withdrawal", to: CONTRACT, amount: 1n, fees: resolveEvmFees("withdrawal") },
          env,
          ACCOUNT
        ),
      claim: () => claim(env),
    };
    for (const [name, build] of Object.entries(builds)) {
      await build().then(
        () => expect.fail(`${name} was built without knowing its recipient`),
        (error: unknown) => expect(String(error), name).to.include("eth_getCode failed")
      );
    }
    expect(codeLookups).to.deep.equal([CONTRACT, ORDINARY]);
  });

  it("setClaimExecutors: refuses an unregistered executor and pays the fees of registered ones", async () => {
    const registered = "0x4444444444444444444444444444444444444444";
    const { env } = chainEnv({ executors: { [registered]: 3n * 10n ** 18n } });
    const setExecutors = (executors: string[]) =>
      buildSetClaimExecutors(
        { type: "setClaimExecutors", executors, fees: resolveEvmFees("setClaimExecutors", {}, executors.length) },
        env,
        ACCOUNT
      );
    await setExecutors([registered, ORDINARY]).then(
      () => expect.fail("set an unregistered executor"),
      (error: unknown) => expect(String(error)).to.include(`Executor ${ORDINARY} is not registered`)
    );
    const bundle = await setExecutors([registered]);
    if (bundle.kind !== "evm") throw new Error("not an EVM transaction");
    expect(bundle.tx.value).to.equal(3n * 10n ** 18n);
  });
});
