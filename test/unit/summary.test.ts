/**
 * The summary interactive mode shows before it signs. The interactive golden covers the requests the menu builds;
 * these are the others, and the details a built transaction may lack.
 */
import { expect } from "chai";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { asNFlr, asWei } from "../../src/chain/units";
import { resolveEvmFees } from "../../src/constants/fees";
import { signingSummary } from "../../src/interactive/summary";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

const account = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "costwo");
const network = networkConfig("costwo", {});
const TO = "0x3333333333333333333333333333333333333333";
const evm = { nonce: 3, value: asWei(0n), maxGasCost: asWei(10n ** 16n) };
const fees = resolveEvmFees("withdrawal");

describe("interactive/summary", () => {
  it("names the network and the account, then what the transaction does and pays", () => {
    expect(
      signingSummary({ type: "withdrawal", to: TO, amount: asWei(10n ** 18n), fees }, evm, account, network)
    ).to.deep.equal([
      "About to sign withdrawal on costwo:",
      `  Account: ${account.cAddress} / ${account.pAddress}`,
      "  Amount: 1 C2FLR",
      `  To: ${TO}`,
      "  Nonce: 3",
      "  Gas: at most 0.01 C2FLR",
    ]);
  });

  it("shows the executor fees a setClaimExecutors pays, and an empty list as clearing it", () => {
    const set = signingSummary(
      { type: "setClaimExecutors", executors: [TO], fees },
      { ...evm, value: asWei(2n * 10n ** 17n) },
      account,
      network
    );
    expect(set).to.include.members([`  Executors: ${TO}`, "  Executor fees: 0.2 C2FLR"]);
    const cleared = signingSummary({ type: "setAllowedClaimRecipients", recipients: [], fees }, evm, account, network);
    expect(cleared).to.include("  Recipients: none (clears the list)");
  });

  it("shows a custom call's target, value and data", () => {
    const lines = signingSummary(
      { type: "customCChainTx", to: TO, value: asWei(5n), data: "0xdeadbeef", fees },
      evm,
      account,
      network
    );
    expect(lines).to.include.members([`  To: ${TO}`, "  Value: 0.000000000000000005 C2FLR", "  Data: 0xdeadbeef"]);
  });

  it("leaves out what the built transaction does not say, and an export of the whole balance says so", () => {
    expect(signingSummary({ type: "importCP" }, {}, account, network)).to.deep.equal([
      "About to sign importCP on costwo:",
      `  Account: ${account.cAddress} / ${account.pAddress}`,
    ]);
    expect(signingSummary({ type: "exportPC" }, { fee: asNFlr(1_000_000n) }, account, network)).to.include.members([
      "  Amount: the spendable balance from the P-chain to the C-chain",
      "  Fee: 0.001 C2FLR",
    ]);
    // the amount the built export takes, when it was read from it
    const details = { fee: asNFlr(1_000_000n), exported: asNFlr(2_500_000_000n) };
    expect(signingSummary({ type: "exportPC" }, details, account, network)).to.include(
      "  Amount: 2.5 C2FLR from the P-chain to the C-chain"
    );
  });
});
