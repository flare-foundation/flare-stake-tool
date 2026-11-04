/**
 * The default gas limit of `claim` and `withdrawal` follows the recipient: an
 * ordinary account gets the low limits, an address with contract code (a smart
 * contract wallet, a Personal Delegation Account that wraps what it receives)
 * the larger limits of 4.4.0. `--gas-limit` replaces the default, and the
 * recipient is then not looked up.
 */
import { expect } from "chai";
import { contractInterface } from "../../src/chain/contracts";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import {
  CLAIM_WRAP_GAS_LIMIT,
  CONTRACT_RECIPIENT_GAS_LIMIT,
  DEFAULT_GAS_LIMIT,
  resolveEvmFees,
} from "../../src/constants/fees";
import { buildClaim, buildWithdrawal } from "../../src/core/builders/evm";
import type { EvmEnv, UnsignedTxBundle } from "../../src/core/types";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const ACCOUNT = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
const ORDINARY = "0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC";
const CONTRACT = "0x3333333333333333333333333333333333333333";
const REWARD_MANAGER = "0x1111111111111111111111111111111111111111";

/** A C-chain with one contract (CONTRACT) and 4 FLR of unclaimed rewards; records the getCode lookups. */
function chainEnv(): { env: EvmEnv; codeLookups: string[] } {
  const codeLookups: string[] = [];
  const selectorOf = (fn: string) => contractInterface.getFunction(fn)!.selector;
  const provider: EvmEnv["clients"]["provider"] = {
    getTransactionCount: () => Promise.resolve(0),
    getCode: (address: string) => {
      codeLookups.push(address);
      return Promise.resolve(address.toLowerCase() === CONTRACT ? "0x6080604052" : "0x");
    },
    call: ({ data }: { data: string }) => {
      if (data.startsWith(selectorOf("getContractAddressByName"))) {
        return Promise.resolve(contractInterface.encodeFunctionResult("getContractAddressByName", [REWARD_MANAGER]));
      }
      if (data.startsWith(selectorOf("getStateOfRewards"))) {
        return Promise.resolve(
          contractInterface.encodeFunctionResult("getStateOfRewards", [5n * 10n ** 18n, 10n ** 18n])
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
