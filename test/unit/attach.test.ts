import { expect } from "chai";
import {
  BigIntPr,
  Id,
  Int,
  OutputOwners,
  TransferOutput,
  Utxo,
  avaxSerial,
  pvm,
  secp256k1,
  messageHashFromUnsignedTx,
  utils,
} from "@flarenetwork/flarejs";
import { getBytes } from "ethers";
import { accountFromPrivateKey } from "../../src/chain/keys";
import { attachSignature, isFullySigned, signatureSlots } from "../../src/core/signing/attach";
import { chainOfAtomicTx, type UnsignedTxBundle } from "../../src/core/types";
import { EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";

/**
 * Builds P-chain transactions offline from a synthetic UTXO and context, so the
 * credential logic (including the Helicon authority credential that flarejs'
 * own helpers never fill) is covered without a node.
 */
const privateKey = getBytes(`0x${EWOQ_PRIVATE_KEY_HEX}`);
const account = accountFromPrivateKey(privateKey, "localflare");
const otherKey = getBytes(`0x${"11".repeat(32)}`);
const other = accountFromPrivateKey(otherKey, "localflare");

const context = {
  networkID: 162,
  hrp: "localflare",
  xBlockchainID: "2JVSBoinj9C2J33VntvzYtVJNZdN2NKiwwKjcumHUWEb5DbBrm",
  pBlockchainID: "11111111111111111111111111111111LpoYY",
  cBlockchainID: "2jvCUmFUH9bPcB8rkD8gpxdGDPHoAeQ2LtzT3azLKkUSeAbhzF",
  avaxAssetID: "FvwEAhmxKfeiG8SnEvq42hc6whRyY3EFYAvebMqDNDGCgxN5Z",
  baseTxFee: 1_000_000n,
  createAssetTxFee: 1_000_000n,
  platformFeeConfig: {
    weights: { 0: 1, 1: 1, 2: 1, 3: 1 }, // FeeDimensions: bandwidth, dbRead, dbWrite, compute
    maxCapacity: 1_000_000n,
    maxPerSecond: 1_000n,
    targetPerSecond: 500n,
    minPrice: 1n,
    excessConversionConstant: 5_000n,
  },
} as unknown as Parameters<typeof pvm.newBaseTx>[1];

const feeState = { capacity: 1_000_000n, excess: 0n, price: 1n, timestamp: new Date().toISOString() };
const utxoOf = (owner: Uint8Array) =>
  new Utxo(
    new avaxSerial.UTXOID(Id.fromString("2QGB9NgqRDs2XtWhLtoTFyyLNYDvpSFtwbFAP1vDM7uWiwqoib"), new Int(0)),
    Id.fromString(context.avaxAssetID),
    new TransferOutput(new BigIntPr(50_000_000_000n), OutputOwners.fromNative([owner]))
  );

function configTx(): UnsignedTxBundle {
  const unsignedTx = pvm.newSetAutoRenewedValidatorConfigTx(
    {
      feeState,
      utxos: [utxoOf(account.addressBytes)],
      fromAddressesBytes: [account.addressBytes],
      validatorTxId: "2QGB9NgqRDs2XtWhLtoTFyyLNYDvpSFtwbFAP1vDM7uWiwqoib",
      auth: [0],
      autoCompoundRewardShares: 0,
      period: 3600n,
    },
    context
  );
  return {
    kind: "atomic",
    chain: chainOfAtomicTx("setAutoRenewedValidatorConfig"),
    txType: "setAutoRenewedValidatorConfig",
    unsignedTx,
    digest: messageHashFromUnsignedTx(unsignedTx),
  };
}

function baseTx(): UnsignedTxBundle {
  const unsignedTx = pvm.newBaseTx(
    {
      feeState,
      utxos: [utxoOf(account.addressBytes)],
      fromAddressesBytes: [account.addressBytes],
      outputs: [
        new avaxSerial.TransferableOutput(
          Id.fromString(context.avaxAssetID),
          new TransferOutput(new BigIntPr(1_000_000_000n), OutputOwners.fromNative([other.addressBytes]))
        ),
      ],
    },
    context
  );
  return { kind: "atomic", chain: "P", txType: "transfer", unsignedTx, digest: messageHashFromUnsignedTx(unsignedTx) };
}

describe("core/signing/attach", () => {
  it("fills the input credentials of an ordinary transaction and reports completeness", async () => {
    const bundle = baseTx();
    if (bundle.kind !== "atomic") throw new Error("atomic expected");
    expect(isFullySigned(bundle.unsignedTx)).to.equal(false);
    expect(signatureSlots(bundle.unsignedTx, account.publicKey)).to.deep.equal([[0, 0]]);
    attachSignature(bundle, await secp256k1.signHash(bundle.digest, privateKey), account);
    expect(isFullySigned(bundle.unsignedTx)).to.equal(true);
    expect(bundle.unsignedTx.hasAllSignatures()).to.equal(true);
  });

  it("also fills the trailing authority credential of SetAutoRenewedValidatorConfigTx", async () => {
    const bundle = configTx();
    if (bundle.kind !== "atomic") throw new Error("atomic expected");
    expect(bundle.unsignedTx.getCredentials().length).to.equal(2);
    expect(signatureSlots(bundle.unsignedTx, account.publicKey)).to.deep.equal([
      [0, 0],
      [1, 0],
    ]);
    // flarejs' own helper leaves the authority credential empty
    const viaFlarejs = configTx();
    if (viaFlarejs.kind !== "atomic") throw new Error("atomic expected");
    viaFlarejs.unsignedTx.addSignature(await secp256k1.signHash(viaFlarejs.digest, privateKey));
    expect(isFullySigned(viaFlarejs.unsignedTx)).to.equal(false);
    attachSignature(bundle, await secp256k1.signHash(bundle.digest, privateKey), account);
    expect(isFullySigned(bundle.unsignedTx)).to.equal(true);
    const signatures = bundle.unsignedTx.getCredentials().map((c) => c.getSignatures());
    expect(signatures[1]).to.deep.equal(signatures[0]);
  });

  it("rejects a signature from another key and a wrongly formatted one", async () => {
    const bundle = baseTx();
    const foreign = await secp256k1.signHash(bundle.digest, otherKey);
    expect(() => attachSignature(bundle, foreign, account)).to.throw(/does not belong to the configured account/);
    expect(() => attachSignature(bundle, "deadbeef", account)).to.throw(/Invalid signature length/);
    expect(utils.bufferToHex(bundle.digest).length).to.equal(66);
  });
});
