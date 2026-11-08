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
import { Transaction, ZeroAddress } from "ethers";
import { contractInterface } from "../../src/chain/contracts";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { asWei } from "../../src/chain/units";
import {
  CLAIM_WRAP_GAS_LIMIT,
  CONTRACT_RECIPIENT_GAS_LIMIT,
  DEFAULT_GAS_LIMIT,
  resolveEvmFees,
} from "../../src/constants/fees";
import {
  buildClaim,
  buildCustomCChainTx,
  buildSetAllowedClaimRecipients,
  buildSetClaimExecutors,
  buildWithdrawal,
} from "../../src/core/builders/evm";
import { builtDetails } from "../../src/core/details";
import {
  FILE_SIGNER_POLICY,
  IMMEDIATE_SIGNER_POLICY,
  type BuildPolicy,
  type EvmEnv,
  type UnsignedTxBundle,
} from "../../src/core/types";
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

/**
 * A C-chain with one contract (CONTRACT) and the given rewards and executors; records the getCode lookups and the
 * block tag of every nonce lookup.
 */
function chainEnv(
  chain: Chain = {},
  network = "localflare"
): { env: EvmEnv; codeLookups: string[]; nonceTags: string[]; rewardsOf: string[] } {
  const codeLookups: string[] = [];
  const nonceTags: string[] = [];
  const rewardsOf: string[] = [];
  const selectorOf = (fn: string) => contractInterface.getFunction(fn)!.selector;
  const provider: EvmEnv["clients"]["provider"] = {
    getTransactionCount: (_address, blockTag) => {
      nonceTags.push(String(blockTag));
      return Promise.resolve(0);
    },
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
        rewardsOf.push(String(contractInterface.decodeFunctionData("getStateOfRewards", data)[0]));
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
  return { env: { network: networkConfig(network, {}), clients: { provider } }, codeLookups, nonceTags, rewardsOf };
}

const gasLimitOf = (bundle: UnsignedTxBundle): bigint => {
  if (bundle.kind !== "evm") throw new Error("not an EVM transaction");
  return bundle.tx.gasLimit;
};

describe("core/builders/evm: default gas limit by recipient", () => {
  it("withdrawal: the low limit to an ordinary account, the 4.4.0 limit to a contract", async () => {
    const { env } = chainEnv();
    const withdrawal = (to: string) =>
      buildWithdrawal(
        { type: "withdrawal", to, amount: asWei(1n), fees: resolveEvmFees("withdrawal") },
        env,
        ACCOUNT,
        IMMEDIATE_SIGNER_POLICY
      );
    expect(gasLimitOf(await withdrawal(ORDINARY))).to.equal(BigInt(DEFAULT_GAS_LIMIT.withdrawal));
    expect(gasLimitOf(await withdrawal(CONTRACT))).to.equal(BigInt(CONTRACT_RECIPIENT_GAS_LIMIT.withdrawal));
  });

  it("claim: the low limit to an ordinary account, the 4.4.0 limit to a contract or when wrapping", async () => {
    const { env, codeLookups } = chainEnv();
    const claim = (recipient: string, wrap: boolean) =>
      buildClaim(
        { type: "claim", recipient, wrap, fees: resolveEvmFees("claim") },
        env,
        ACCOUNT,
        IMMEDIATE_SIGNER_POLICY
      );
    expect(gasLimitOf(await claim(ORDINARY, false))).to.equal(BigInt(DEFAULT_GAS_LIMIT.claim));
    expect(gasLimitOf(await claim(CONTRACT, false))).to.equal(BigInt(CONTRACT_RECIPIENT_GAS_LIMIT.claim));
    const lookups = codeLookups.length;
    expect(gasLimitOf(await claim(ORDINARY, true))).to.equal(BigInt(CLAIM_WRAP_GAS_LIMIT));
    expect(codeLookups.length, "wrapping needs no recipient lookup").to.equal(lookups);
  });

  it("uses --gas-limit as given and then does not look the recipient up", async () => {
    const { env, codeLookups } = chainEnv();
    const fees = resolveEvmFees("claim", { gasLimit: "450000" });
    const bundle = await buildClaim(
      { type: "claim", recipient: CONTRACT, wrap: false, fees },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );
    expect(gasLimitOf(bundle)).to.equal(450_000n);
    const withdrawal = await buildWithdrawal(
      {
        type: "withdrawal",
        to: ORDINARY,
        amount: asWei(1n),
        fees: resolveEvmFees("withdrawal", { gasLimit: "70000" }),
      },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );
    expect(gasLimitOf(withdrawal)).to.equal(70_000n);
    expect(codeLookups).to.deep.equal([]);
  });
});

describe("core/builders/evm: refusals before anything is signed", () => {
  const claim = (env: EvmEnv, amount?: bigint) =>
    buildClaim(
      {
        type: "claim",
        recipient: ORDINARY,
        wrap: false,
        fees: resolveEvmFees("claim"),
        amount: amount === undefined ? undefined : asWei(amount),
      },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );

  it("claim: refuses more than the unclaimed rewards, zero, and a claim when nothing is unclaimed", async () => {
    const refusal = (trying: string, unclaimed: string) =>
      `Trying to claim: ${trying} LFLR. Unclaimed rewards: ${unclaimed} LFLR. ` +
      "Amount should be greater than 0 and less than or equal to unclaimed rewards.";
    const fourUnclaimed = chainEnv();
    const noneUnclaimed = chainEnv({ unclaimedWei: 0n });
    for (const [chain, amount, message] of [
      [fourUnclaimed, 5n * 10n ** 18n, refusal("5", "4")],
      [fourUnclaimed, 0n, refusal("0", "4")],
      [noneUnclaimed, undefined, refusal("0", "0")],
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
          { type: "withdrawal", to: CONTRACT, amount: asWei(1n), fees: resolveEvmFees("withdrawal") },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
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
        ACCOUNT,
        IMMEDIATE_SIGNER_POLICY
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

describe("core/builders/evm: the zero address", () => {
  const refused = (build: () => Promise<unknown>, what: string) =>
    build().then(
      () => expect.fail(`built with the zero address as ${what}`),
      (error: unknown) =>
        expect((error as Error).message).to.equal(`${what} is the zero address, which no one can spend from`)
    );

  it("is refused where it would get funds or the right to them, before the node is asked", async () => {
    const { env, nonceTags, codeLookups } = chainEnv();
    await refused(
      () =>
        buildWithdrawal(
          { type: "withdrawal", to: ZeroAddress, amount: asWei(1n), fees: resolveEvmFees("withdrawal") },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
      "The withdrawal recipient (--to)"
    );
    await refused(
      () =>
        buildClaim(
          { type: "claim", recipient: ZeroAddress, wrap: false, fees: resolveEvmFees("claim") },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
      "The claim recipient (--recipient)"
    );
    await refused(
      () =>
        buildSetClaimExecutors(
          { type: "setClaimExecutors", executors: [ZeroAddress], fees: resolveEvmFees("setClaimExecutors", {}, 1) },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
      "An executor (--executors)"
    );
    await refused(
      () =>
        buildSetAllowedClaimRecipients(
          {
            type: "setAllowedClaimRecipients",
            recipients: [ORDINARY, ZeroAddress],
            fees: resolveEvmFees("setAllowedClaimRecipients", {}, 2),
          },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
      "An allowed claim recipient (--recipients)"
    );
    const custom = (value: bigint) =>
      buildCustomCChainTx(
        { type: "customCChainTx", to: ZeroAddress, value: asWei(value), data: "0x", fees: resolveEvmFees("custom") },
        env,
        ACCOUNT,
        IMMEDIATE_SIGNER_POLICY
      );
    await refused(() => custom(1n), "The recipient of a value (--to)");
    expect(nonceTags, "no nonce lookup").to.deep.equal([]);
    expect(codeLookups, "no recipient lookup").to.deep.equal([]);
    // a call without value, and an empty list, which clears the stored one
    const call = await custom(0n);
    if (call.kind !== "evm") throw new Error("not an EVM transaction");
    expect(call.tx.to).to.equal(ZeroAddress);
    const cleared = await buildSetAllowedClaimRecipients(
      { type: "setAllowedClaimRecipients", recipients: [], fees: resolveEvmFees("setAllowedClaimRecipients", {}, 0) },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );
    expect(cleared.kind).to.equal("evm");
  });
});

describe("core/builders/evm: what goes into the transaction", () => {
  // the account is ewoq; every recipient here is another address, so owner and recipient can't be mixed up unseen
  it("claim: the account's rewards (owner), to the recipient given, the amount and the wrap flag", async () => {
    for (const wrap of [false, true]) {
      const { env, rewardsOf } = chainEnv();
      const bundle = await buildClaim(
        { type: "claim", recipient: CONTRACT, wrap, amount: asWei(3n * 10n ** 18n), fees: resolveEvmFees("claim") },
        env,
        ACCOUNT,
        IMMEDIATE_SIGNER_POLICY
      );
      if (bundle.kind !== "evm") throw new Error("not an EVM transaction");
      const [owner, recipient, amount, wrapped] = contractInterface.decodeFunctionData("claim", bundle.tx.data);
      expect([owner, recipient, amount, wrapped], `wrap ${wrap}`).to.deep.equal([
        ACCOUNT.cAddress,
        "0x3333333333333333333333333333333333333333",
        3n * 10n ** 18n,
        wrap,
      ]);
      expect(rewardsOf, "the rewards looked up are the account's, not the recipient's").to.deep.equal([
        ACCOUNT.cAddress,
      ]);
      expect(bundle.tx.to).to.equal(REWARD_MANAGER);
    }
  });

  it("withdrawal and customCChainTx: the recipient given, not the account", async () => {
    const { env } = chainEnv();
    const other = "0x5555555555555555555555555555555555555555"; // ORDINARY is the account's own address
    const withdrawal = await buildWithdrawal(
      { type: "withdrawal", to: other, amount: asWei(5n), fees: resolveEvmFees("withdrawal") },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );
    const custom = await buildCustomCChainTx(
      { type: "customCChainTx", to: CONTRACT, value: asWei(7n), data: "0xdeadbeef", fees: resolveEvmFees("custom") },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );
    if (withdrawal.kind !== "evm" || custom.kind !== "evm") throw new Error("not an EVM transaction");
    expect([withdrawal.tx.to, withdrawal.tx.value]).to.deep.equal([other, 5n]);
    expect([custom.tx.to, custom.tx.value, custom.tx.data]).to.deep.equal([
      "0x3333333333333333333333333333333333333333",
      7n,
      "0xdeadbeef",
    ]);
  });

  it("signs for the C-chain's chain id, which on Songbird and Coston is not the network id", async () => {
    const executor = "0x4444444444444444444444444444444444444444";
    for (const [network, chainId, networkId] of [
      ["songbird", 19n, 5],
      ["coston", 16n, 7],
    ] as const) {
      const { env } = chainEnv({ executors: { [executor]: 0n } }, network);
      expect(networkConfig(network, {}).networkId).to.equal(networkId);
      const fees = resolveEvmFees("withdrawal");
      const bundles = [
        await buildWithdrawal(
          { type: "withdrawal", to: ORDINARY, amount: asWei(1n), fees },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
        await buildClaim(
          { type: "claim", recipient: ORDINARY, wrap: false, fees },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
        await buildSetClaimExecutors(
          { type: "setClaimExecutors", executors: [executor], fees },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
        await buildSetAllowedClaimRecipients(
          { type: "setAllowedClaimRecipients", recipients: [ORDINARY], fees },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
        await buildCustomCChainTx(
          { type: "customCChainTx", to: ORDINARY, value: asWei(0n), data: "0x", fees },
          env,
          ACCOUNT,
          IMMEDIATE_SIGNER_POLICY
        ),
      ];
      for (const bundle of bundles) {
        if (bundle.kind !== "evm") throw new Error("not an EVM transaction");
        // decoded from the serialized transaction, as it is signed and sent
        expect(Transaction.from(bundle.tx.unsignedSerialized).chainId, `${network} ${bundle.txType}`).to.equal(chainId);
      }
    }
  });
});

describe("core/details: what a built C-chain transaction holds", () => {
  it("reads the nonce, value, most the gas can cost, and the amount claimed when no amount was given", async () => {
    const executor = "0x4444444444444444444444444444444444444444";
    const { env } = chainEnv({ executors: { [executor]: 3n * 10n ** 18n } });
    const claim = await buildClaim(
      { type: "claim", recipient: ORDINARY, wrap: false, nonce: 5, fees: resolveEvmFees("claim") },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );
    if (claim.kind !== "evm") throw new Error("not an EVM transaction");
    expect(builtDetails(claim, undefined)).to.deep.equal({
      nonce: 5,
      value: 0n,
      maxGasCost: claim.tx.gasLimit * claim.tx.maxFeePerGas!,
      claimed: 4n * 10n ** 18n, // all unclaimed rewards, read from the chain
    });
    const executors = await buildSetClaimExecutors(
      { type: "setClaimExecutors", executors: [executor], fees: resolveEvmFees("setClaimExecutors", {}, 1) },
      env,
      ACCOUNT,
      IMMEDIATE_SIGNER_POLICY
    );
    expect(builtDetails(executors, undefined)).to.include({ nonce: 0, value: 3n * 10n ** 18n });
  });
});

describe("core/builders/evm: the nonce", () => {
  it("counts the node's waiting transactions when sending now, not for a ForDefi file, and is not looked up with --nonce", async () => {
    const { env, nonceTags } = chainEnv();
    const withdrawal = (policy: BuildPolicy, nonce?: number) =>
      buildWithdrawal(
        { type: "withdrawal", to: ORDINARY, amount: asWei(1n), nonce, fees: resolveEvmFees("withdrawal") },
        env,
        ACCOUNT,
        policy
      );
    await withdrawal(IMMEDIATE_SIGNER_POLICY);
    await withdrawal(FILE_SIGNER_POLICY);
    const pinned = await withdrawal(IMMEDIATE_SIGNER_POLICY, 7);
    const zero = await withdrawal(IMMEDIATE_SIGNER_POLICY, 0); // a pinned 0, not a missing nonce
    expect(nonceTags).to.deep.equal(["pending", "latest"]);
    if (pinned.kind !== "evm" || zero.kind !== "evm") throw new Error("not an EVM transaction");
    expect(pinned.tx.nonce).to.equal(7);
    expect(zero.tx.nonce).to.equal(0);
  });
});
