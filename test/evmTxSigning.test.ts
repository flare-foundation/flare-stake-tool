import { expect } from "chai";
import { Transaction, TransactionLike, Wallet } from "ethers";
import { attachEvmSignature, buildSignedEvmTx, evmTxToSign, rebuildSignedEvmTx } from "../src/forDefi/evmTx";
import { Context } from "../src/interfaces";
import { resolveEvmFees } from "../src/constants/fees";

/**
 * Captured from the published v4.3.3 running `withdrawal` against costwo. It has
 * no `type` field, because that release built legacy transactions and left the
 * type for ethers to infer. `forDefiHash` is the value that release printed and
 * wrote to its unsigned tx file, so it is what a ForDefi signature was produced
 * over.
 */
const PUBLISHED_V433_TX = {
  // Stored as a string, which is what that release wrote and what ethers accepts
  // at runtime. Production reads it back with the same cast.
  nonce: "3",
  gasPrice: 2_000_000_000_000,
  gasLimit: 4_000_000,
  to: "0x2222222222222222222222222222222222222222",
  value: "1000000000000000000",
  chainId: 114,
} as unknown as TransactionLike;
const PUBLISHED_V433_FORDEFI_HASH = "ltNACMnu0f41JUyIaHLK3F/TkaSAeAbxe6/hA7ojnIk=";

/** Well-known test key, published in every Hardhat and Anvil default account list. */
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function forDefiHashOf(tx: Transaction): string {
  return Buffer.from(tx.unsignedHash.slice(2), "hex").toString("base64");
}

/** Only the private key is read by the signing path under test. */
const KEY_ONLY_CTX = { privkHex: TEST_KEY } as unknown as Context;

/** A 65-byte signature in the form a signing device returns it. */
function deviceSignature(tx: Transaction): string {
  const sig = new Wallet(TEST_KEY).signingKey.sign(tx.unsignedHash);
  return sig.r.slice(2) + sig.s.slice(2) + sig.v.toString(16).padStart(2, "0");
}

describe("C-chain EVM transaction signing", () => {
  describe("transactions written by earlier versions", () => {
    it("still hashes to what the published version recorded", () => {
      // If this breaks, an unsigned tx file awaiting a ForDefi signature would
      // be signed over a different hash than the one it was approved for.
      expect(forDefiHashOf(Transaction.from(PUBLISHED_V433_TX))).to.equal(PUBLISHED_V433_FORDEFI_HASH);
    });

    it("still resolves to EIP-2930, which is what it was signed as", () => {
      const tx = Transaction.from(PUBLISHED_V433_TX);
      expect(tx.inferTypes()).to.deep.equal([0, 1]);
      expect(Transaction.from(tx.unsignedSerialized).type).to.equal(1);
    });

    it("survives the JSON round trip the ForDefi flow puts it through", () => {
      const reloaded = JSON.parse(JSON.stringify({ rawTx: PUBLISHED_V433_TX })).rawTx;
      expect(forDefiHashOf(Transaction.from(reloaded))).to.equal(PUBLISHED_V433_FORDEFI_HASH);
    });
  });

  describe("transactions written now", () => {
    const rawTx = {
      nonce: 3,
      to: "0x2222222222222222222222222222222222222222",
      data: "0xabcdef",
      chainId: 114,
      ...resolveEvmFees("claim"),
    };

    it("survives the JSON round trip with its type and hash intact", () => {
      const reloaded = JSON.parse(JSON.stringify({ rawTx })).rawTx;
      expect(Transaction.from(reloaded).type).to.equal(2);
      expect(forDefiHashOf(Transaction.from(reloaded))).to.equal(forDefiHashOf(Transaction.from(rawTx)));
    });

    it("serializes as an EIP-1559 envelope through the private key path", async () => {
      const signed = await buildSignedEvmTx("privateKey", KEY_ONLY_CTX, rawTx);
      expect(signed.slice(0, 4)).to.equal("0x02");
      const parsed = Transaction.from(signed);
      expect(parsed.type).to.equal(2);
      expect(parsed.from).to.equal(new Wallet(TEST_KEY).address);
    });

    it("serializes as an EIP-1559 envelope when a device signature is attached", () => {
      const tx = Transaction.from(rawTx);
      const parsed = Transaction.from(attachEvmSignature(tx, deviceSignature(tx)));
      expect(parsed.type).to.equal(2);
      expect(parsed.from).to.equal(new Wallet(TEST_KEY).address);
    });

    it("rejects a malformed device signature rather than sending garbage", () => {
      expect(() => attachEvmSignature(Transaction.from(rawTx), "0xdeadbeef")).to.throw(/Invalid signature length/);
    });

    it("honours a type-free transaction's legacy default rather than re-inferring", async () => {
      // No current caller relies on this: every builder sets type 2 explicitly.
      // It is pinned so the default is not quietly changed to 2, which would
      // alter the envelope for any external caller passing a legacy transaction.
      const legacyRawTx = {
        nonce: 3,
        to: "0x2222222222222222222222222222222222222222",
        data: "0xabcdef",
        chainId: 114,
        gasPrice: 2_000_000_000_000,
        gasLimit: 4_000_000,
      };
      const signed = await buildSignedEvmTx("privateKey", KEY_ONLY_CTX, legacyRawTx);
      expect(Transaction.from(signed).type).to.equal(0);
    });

    it("carries the resolved fee fields into the signed transaction", async () => {
      const fees = resolveEvmFees("claim");
      const parsed = Transaction.from(await buildSignedEvmTx("privateKey", KEY_ONLY_CTX, rawTx));
      expect(parsed.maxFeePerGas).to.equal(BigInt(fees.maxFeePerGas));
      expect(parsed.maxPriorityFeePerGas).to.equal(BigInt(fees.maxPriorityFeePerGas));
      expect(parsed.gasLimit).to.equal(BigInt(fees.gasLimit));
      expect(parsed.gasPrice).to.equal(null);
    });

    it("gives the private key and device paths the same signed bytes", async () => {
      // These diverged before: the private key path rebuilt the transaction
      // from a copy that dropped the type, so it signed a different envelope.
      const fromPrivateKey = await buildSignedEvmTx("privateKey", KEY_ONLY_CTX, rawTx);
      const tx = Transaction.from(rawTx);
      expect(attachEvmSignature(tx, deviceSignature(tx))).to.equal(fromPrivateKey);
    });
  });

  describe("reattaching a ForDefi signature", () => {
    it("keeps a legacy stored transaction on the envelope it was signed over", () => {
      // The stored fields are rebuilt without forcing a type, so a file from an
      // older version stays EIP-2930 rather than becoming type 0 or 2.
      const tx = Transaction.from(PUBLISHED_V433_TX);
      const signed = rebuildSignedEvmTx(PUBLISHED_V433_TX, deviceSignature(tx));
      const parsed = Transaction.from(signed);
      expect(parsed.type).to.equal(1);
      expect(parsed.from).to.equal(new Wallet(TEST_KEY).address);
    });

    it("keeps a type-2 stored transaction as EIP-1559", () => {
      const rawTx = {
        nonce: 3,
        to: "0x2222222222222222222222222222222222222222",
        data: "0xabcdef",
        chainId: 114,
        ...resolveEvmFees("claim"),
      };
      const signed = rebuildSignedEvmTx(rawTx, deviceSignature(Transaction.from(rawTx)));
      const parsed = Transaction.from(signed);
      expect(parsed.type).to.equal(2);
      expect(parsed.from).to.equal(new Wallet(TEST_KEY).address);
    });

    it("survives the JSON round trip the stored file imposes", () => {
      const rawTx = {
        nonce: 3,
        to: "0x2222222222222222222222222222222222222222",
        chainId: 114,
        ...resolveEvmFees("withdrawal"),
      };
      const signature = deviceSignature(Transaction.from(rawTx));
      const reloaded = JSON.parse(JSON.stringify({ rawTx })).rawTx;
      expect(rebuildSignedEvmTx(reloaded, signature)).to.equal(rebuildSignedEvmTx(rawTx, signature));
    });
  });

  describe("the Ledger branch", () => {
    const DERIVATION_PATH = "m/44'/60'/0'/0/0";
    const rawTx = {
      nonce: 3,
      to: "0x2222222222222222222222222222222222222222",
      data: "0xabcdef",
      chainId: 114,
      ...resolveEvmFees("claim"),
    };

    /** Stands in for the device, recording what it was asked to sign. */
    function recordingDevice(seen: { path?: string; payload?: string }) {
      return async (path: string, payload: string): Promise<string> => {
        seen.path = path;
        seen.payload = payload;
        return deviceSignature(Transaction.from(payload));
      };
    }

    it("hands the device the transaction as it will be signed", async () => {
      // Pins the bytes shown on the device. If this drifts from evmTxToSign, the
      // device would display and sign something other than what is broadcast.
      const seen: { path?: string; payload?: string } = {};
      await buildSignedEvmTx("ledger", {} as Context, rawTx, DERIVATION_PATH, recordingDevice(seen));
      expect(seen.path).to.equal(DERIVATION_PATH);
      expect(seen.payload).to.equal(evmTxToSign(rawTx).unsignedSerialized);
      expect(Transaction.from(seen.payload).type).to.equal(2);
    });

    it("produces the same signed bytes as the private key path", async () => {
      const seen: { path?: string; payload?: string } = {};
      const fromLedger = await buildSignedEvmTx("ledger", {} as Context, rawTx, DERIVATION_PATH, recordingDevice(seen));
      const fromPrivateKey = await buildSignedEvmTx("privateKey", KEY_ONLY_CTX, rawTx);
      expect(fromLedger).to.equal(fromPrivateKey);
    });

    it("refuses to sign without a derivation path", async () => {
      const seen: { path?: string; payload?: string } = {};
      try {
        await buildSignedEvmTx("ledger", {} as Context, rawTx, undefined, recordingDevice(seen));
        expect.fail("should have thrown");
      } catch (e) {
        expect((e as Error).message).to.match(/Derivation path required/);
      }
      expect(seen.payload, "device must not be called").to.equal(undefined);
    });
  });
});
