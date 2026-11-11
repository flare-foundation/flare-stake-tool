import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import { Transaction } from "ethers";
import {
  bundleFromUnsignedTxJson,
  forDefiHashOf,
  isAlreadySentToChain,
  markSentToChain,
  messageOf,
  readSignedTxJson,
  readUnsignedTxJson,
  saveUnsignedTxJson,
  unsignedTxJsonFromBundle,
  writeSignedTxJson,
  type UnsignedAtomicTxJson,
  type UnsignedEvmTxJson,
} from "../../src/core/files";
import { toHex } from "../../src/core/signing/signature";

/** The unsigned file the previous release wrote for `transaction exportCP -i exportCP-file` (recorded golden). */
const recordedAtomic = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "golden", "exportCP-file.json"), "utf8"))
  .outcome.unsignedTxJson as UnsignedAtomicTxJson;

/** Captured from the published v4.3.3 (`withdrawal` on costwo): type-less, hashed as EIP-2930. */
const PUBLISHED_V433_FORDEFI_HASH = "ltNACMnu0f41JUyIaHLK3F/TkaSAeAbxe6/hA7ojnIk=";
const PUBLISHED_V433_TX: UnsignedEvmTxJson = {
  transactionType: "EVM",
  rawTx: {
    nonce: "3",
    gasPrice: 2_000_000_000_000,
    gasLimit: 4_000_000,
    to: "0x2222222222222222222222222222222222222222",
    value: "1000000000000000000",
    chainId: 114,
  } as never,
  message: Buffer.from(PUBLISHED_V433_FORDEFI_HASH, "base64").toString("hex"),
};

describe("core/files", () => {
  it("round-trips a recorded atomic unsigned file through the bundle", () => {
    const bundle = bundleFromUnsignedTxJson(recordedAtomic);
    expect(bundle.kind).to.equal("atomic");
    if (bundle.kind !== "atomic") return;
    expect(bundle.chain).to.equal("C");
    expect(toHex(bundle.digest)).to.equal(messageOf(recordedAtomic));
    const again = unsignedTxJsonFromBundle(bundle) as UnsignedAtomicTxJson;
    expect(again.unsignedTransactionBuffer).to.equal(recordedAtomic.unsignedTransactionBuffer);
    expect(again.serialization).to.equal(recordedAtomic.serialization);
    expect(again.signatureRequests).to.deep.equal(recordedAtomic.signatureRequests);
    expect(forDefiHashOf(messageOf(again))).to.equal(recordedAtomic.forDefiHash);
  });

  it("keeps a type-less EVM file from an older version on the envelope it was signed over", () => {
    const bundle = bundleFromUnsignedTxJson(PUBLISHED_V433_TX);
    expect(bundle.kind).to.equal("evm");
    if (bundle.kind !== "evm") return;
    expect(toHex(bundle.digest)).to.equal(PUBLISHED_V433_TX.message);
    expect(forDefiHashOf(toHex(bundle.digest))).to.equal(PUBLISHED_V433_FORDEFI_HASH);
    expect(Transaction.from(bundle.tx.unsignedSerialized).type).to.equal(1);
    // and a JSON round trip, as the file flow imposes, changes nothing
    const reloaded = JSON.parse(JSON.stringify(PUBLISHED_V433_TX)) as UnsignedEvmTxJson;
    expect(toHex(bundleFromUnsignedTxJson(reloaded).digest)).to.equal(PUBLISHED_V433_TX.message);
  });

  it("writes, reads and marks files under ForDefiTxnFiles in the working directory", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "files-test-"));
    try {
      const { file, forDefiHash } = saveUnsignedTxJson(recordedAtomic, "t1", cwd);
      expect(file).to.equal(path.join(cwd, "ForDefiTxnFiles", "UnsignedTxns", "t1.unsignedTx.json"));
      expect(forDefiHash).to.equal(recordedAtomic.forDefiHash);
      expect(() => saveUnsignedTxJson(recordedAtomic, "t1", cwd)).to.throw(/already exists/);
      expect(readUnsignedTxJson("t1", cwd).transactionType).to.equal("exportCP");
      expect(() => readSignedTxJson("t1", cwd)).to.throw(/does not exist/);
      writeSignedTxJson({ ...recordedAtomic, signature: "00".repeat(65) }, "t1", cwd);
      expect(isAlreadySentToChain("t1", cwd)).to.equal(false);
      markSentToChain("t1", cwd);
      expect(isAlreadySentToChain("t1", cwd)).to.equal(true);
      expect(readSignedTxJson("t1", cwd).isSentToChain).to.equal(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("refuses an atomic file of an unknown type, a missing unsigned file and a signed file without signature", () => {
    expect(() => bundleFromUnsignedTxJson({ ...recordedAtomic, transactionType: "stakeAll" })).to.throw(
      "Unknown transaction type: stakeAll"
    );
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "files-test-"));
    try {
      expect(() => readUnsignedTxJson("t2", cwd)).to.throw(
        `unsignedTx file ${path.join(cwd, "ForDefiTxnFiles", "UnsignedTxns", "t2.unsignedTx.json")} does not exist`
      );
      writeSignedTxJson({ ...recordedAtomic, signature: "" }, "t2", cwd);
      expect(() => readSignedTxJson("t2", cwd)).to.throw(
        `signedTx file ${path.join(cwd, "ForDefiTxnFiles", "SignedTxns", "t2.signedTx.json")} does not contain signature`
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
