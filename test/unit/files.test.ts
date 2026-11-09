import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import { SigningKey, Transaction } from "ethers";
import {
  bundleFromConsistentTxJson,
  bundleFromUnsignedTxJson,
  checkedTxId,
  forDefiHashOf,
  isAlreadySentToChain,
  markSentToChain,
  messageOf,
  readSignedTxJson,
  readUnsignedTxJson,
  replaceFile,
  saveSignedTxJson,
  saveUnsignedTxJson,
  signerMismatch,
  signedTxPath,
  unsignedTxJsonFromBundle,
  unsignedTxPath,
  writeSignedTxJson,
  writeUnsignedTxJson,
  type UnsignedAtomicTxJson,
  type UnsignedEvmTxJson,
  type UnsignedTxJson,
} from "../../src/core/files";
import { accountFromPublicKey } from "../../src/chain/keys";
import { toHex } from "../../src/core/signing/signature";
import { EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

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
    // the recorded file was built for the test context, the ewoq key
    const ewoq = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
    const again = unsignedTxJsonFromBundle(bundle, ewoq) as UnsignedAtomicTxJson;
    expect(again.unsignedTransactionBuffer).to.equal(recordedAtomic.unsignedTransactionBuffer);
    expect(again.serialization).to.equal(recordedAtomic.serialization);
    expect(again.signatureRequests).to.deep.equal(recordedAtomic.signatureRequests);
    expect(forDefiHashOf(messageOf(again))).to.equal(recordedAtomic.forDefiHash);
  });

  describe("the account a file was built for (signer)", () => {
    const golden = (name: string) =>
      JSON.parse(fs.readFileSync(path.join(__dirname, "..", "golden", `${name}.json`), "utf8")).outcome
        .unsignedTxJson as UnsignedTxJson;
    const ewoq = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
    const other = accountFromPublicKey(new SigningKey(`0x${"22".repeat(32)}`).compressedPublicKey, "localflare");
    const atomic = golden("delegate-file") as UnsignedAtomicTxJson;
    const evm = golden("withdrawal-file") as UnsignedEvmTxJson;
    const withSigner = (signer: string | undefined): UnsignedAtomicTxJson => ({
      ...atomic,
      signatureRequests: [{ message: atomic.signatureRequests[0]!.message, signer: signer as string }],
    });

    it("is written as the P-chain address, or the C-chain address in an EVM file, outside the hash", () => {
      expect(atomic.signatureRequests[0]!.signer).to.equal(ewoq.pAddress);
      expect(evm.signer).to.equal(ewoq.cAddress);
      expect(signerMismatch(atomic, ewoq.publicKey)).to.equal(undefined);
      expect(signerMismatch(evm, ewoq.publicKey)).to.equal(undefined);
    });

    it("names both accounts when another key is to sign", () => {
      expect(signerMismatch(atomic, other.publicKey)).to.deep.equal({
        recorded: ewoq.pAddress,
        actual: other.pAddress,
      });
      expect(signerMismatch(evm, other.publicKey)).to.deep.equal({ recorded: ewoq.cAddress, actual: other.cAddress });
    });

    it("compares address bytes, so the same key on another network's prefix matches, and any C-chain case", () => {
      const costwo = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "costwo").pAddress;
      expect(signerMismatch(withSigner(costwo), ewoq.publicKey)).to.equal(undefined);
      expect(signerMismatch(withSigner(costwo), other.publicKey)).to.deep.equal({
        recorded: costwo,
        actual: accountFromPublicKey(other.publicKey, "costwo").pAddress,
      });
      expect(signerMismatch({ ...evm, signer: ewoq.cAddress.toLowerCase() }, ewoq.publicKey)).to.equal(undefined);
    });

    it("is not checked in files from earlier versions, where it is empty or missing", () => {
      for (const json of [
        withSigner(""),
        withSigner(undefined),
        { ...evm, signer: undefined },
        { ...evm, signer: "" },
      ]) {
        expect(signerMismatch(json, other.publicKey)).to.equal(undefined);
      }
    });

    it("refuses a signer that is not an address of the file's kind", () => {
      expect(() => signerMismatch(withSigner(ewoq.cAddress), ewoq.publicKey)).to.throw(
        `The file's signer "${ewoq.cAddress}" is not a P-chain address`
      );
      expect(() => signerMismatch({ ...evm, signer: ewoq.pAddress }, ewoq.publicKey)).to.throw(
        `The file's signer "${ewoq.pAddress}" is not a C-chain address`
      );
    });
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

  describe("bundleFromConsistentTxJson: the message and buffer must be the file's transaction", () => {
    const goldenDir = path.join(__dirname, "..", "golden");
    const fileOf = (name: string) =>
      JSON.parse(fs.readFileSync(path.join(goldenDir, `${name}.json`), "utf8")).outcome
        .unsignedTxJson as UnsignedTxJson;
    /** Every unsigned file the goldens recorded, atomic and EVM. */
    const recorded = fs
      .readdirSync(goldenDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length))
      .filter(
        (name) =>
          (
            JSON.parse(fs.readFileSync(path.join(goldenDir, `${name}.json`), "utf8")) as {
              outcome?: { unsignedTxJson?: unknown };
            }
          ).outcome?.unsignedTxJson !== undefined
      );
    const digestOf = (json: UnsignedTxJson) => toHex(bundleFromUnsignedTxJson(json).digest);
    const delegate = fileOf("delegate-file") as UnsignedAtomicTxJson;
    const transfer = fileOf("transfer-file") as UnsignedAtomicTxJson;

    it("accepts every recorded unsigned file and the published v4.3.3 one, with the same bundle as the plain reader", () => {
      expect(recorded.length).to.be.greaterThan(15);
      for (const json of [...recorded.map(fileOf), PUBLISHED_V433_TX]) {
        expect(toHex(bundleFromConsistentTxJson(json).digest)).to.equal(digestOf(json));
      }
    });

    it("accepts a message or buffer with 0x or in uppercase, and an atomic file without a buffer", () => {
      const message = messageOf(delegate);
      for (const json of [
        { ...delegate, signatureRequests: [{ message: `0x${message}`, signer: "" }] },
        { ...delegate, signatureRequests: [{ message: message.toUpperCase(), signer: "" }] },
        { ...delegate, unsignedTransactionBuffer: `0x${delegate.unsignedTransactionBuffer.toUpperCase()}` },
        { ...delegate, unsignedTransactionBuffer: "" },
      ]) {
        expect(toHex(bundleFromConsistentTxJson(json).digest)).to.equal(message);
      }
    });

    it("refuses a message that is another transaction's hash, atomic or EVM", () => {
      const evm = fileOf("withdrawal-file") as UnsignedEvmTxJson;
      const otherEvm = fileOf("claim-file") as UnsignedEvmTxJson;
      for (const [json, digest] of [
        [{ ...delegate, signatureRequests: [{ message: messageOf(transfer), signer: "" }] }, messageOf(delegate)],
        [{ ...evm, message: otherEvm.message }, evm.message],
      ] as [UnsignedTxJson, string][]) {
        expect(() => bundleFromConsistentTxJson(json)).to.throw(
          `The file's message ${messageOf(json)} is not the hash of its transaction (${digest}); rebuild the file`
        );
      }
    });

    it("refuses a forDefiHash that is not the transaction's, and accepts the published v4.3.3 one and none", () => {
      const evm = fileOf("withdrawal-file") as UnsignedEvmTxJson;
      const otherEvm = fileOf("claim-file") as UnsignedEvmTxJson;
      for (const [json, own] of [
        [{ ...delegate, forDefiHash: transfer.forDefiHash }, delegate.forDefiHash],
        [{ ...evm, forDefiHash: otherEvm.forDefiHash }, evm.forDefiHash],
      ] as [UnsignedTxJson, string][]) {
        expect(() => bundleFromConsistentTxJson(json)).to.throw(
          `The file's forDefiHash ${json.forDefiHash} is not the hash of its transaction (${own}); rebuild the file`
        );
      }
      for (const json of [
        { ...PUBLISHED_V433_TX, forDefiHash: PUBLISHED_V433_FORDEFI_HASH },
        { ...delegate, forDefiHash: "" },
        { ...delegate, forDefiHash: undefined },
      ]) {
        expect(() => bundleFromConsistentTxJson(json)).not.to.throw();
      }
    });

    it("refuses a buffer of another transaction, even when message and serialization agree with each other", () => {
      // transfer's buffer, delegate's serialization and message: the buffer shows one transaction, the hash is another's
      const json = { ...delegate, unsignedTransactionBuffer: transfer.unsignedTransactionBuffer };
      expect(() => bundleFromConsistentTxJson(json)).to.throw(
        "The file's unsignedTransactionBuffer is not the transaction in its serialization; rebuild the file"
      );
    });
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

  describe("transaction ids and file writes", () => {
    let cwd: string;
    const signed = (signature: string) => ({ ...recordedAtomic, signature });

    beforeEach(() => {
      cwd = fs.mkdtempSync(path.join(os.tmpdir(), "files-test-"));
    });

    afterEach(() => {
      fs.rmSync(cwd, { recursive: true, force: true });
    });

    /** Runs `action` while fs.existsSync answers false, as if a file appeared right after the check. */
    function withFileAppearingAfterCheck(action: () => void): void {
      const original = fs.existsSync;
      fs.existsSync = () => false;
      try {
        action();
      } finally {
        fs.existsSync = original;
      }
    }

    it("refuses an id that names a file outside its directory, or a hidden one, in every read and write", () => {
      for (const id of ["../x", "../../x", "a/b", "a\\b", ".hidden", "..", "", "a b", "é"]) {
        const refusal = `Invalid transaction id "${id}": use letters, digits, ".", "_" and "-", not starting with "."`;
        expect(() => unsignedTxPath(id, cwd), id).to.throw(refusal);
        expect(() => signedTxPath(id, cwd), id).to.throw(refusal);
        expect(() => saveUnsignedTxJson(recordedAtomic, id, cwd), id).to.throw(refusal);
        expect(() => readUnsignedTxJson(id, cwd), id).to.throw(refusal);
        expect(() => readSignedTxJson(id, cwd), id).to.throw(refusal);
        expect(() => isAlreadySentToChain(id, cwd), id).to.throw(refusal);
      }
      expect(fs.readdirSync(cwd)).to.deep.equal([]);
      for (const id of ["tx1", "A-b_c.1", "2026.11.07-stake", "_x"]) {
        expect(checkedTxId(id)).to.equal(id);
      }
    });

    it("saveUnsignedTxJson does not overwrite an unsigned file that appears after its check", () => {
      const { file } = saveUnsignedTxJson(recordedAtomic, "t1", cwd);
      fs.writeFileSync(file, "the other writer's file");
      withFileAppearingAfterCheck(() => expect(() => saveUnsignedTxJson(recordedAtomic, "t1", cwd)).to.throw(/EEXIST/));
      expect(fs.readFileSync(file, "utf8")).to.equal("the other writer's file");
    });

    it("saveSignedTxJson creates the file, and refuses to overwrite one that appears after its check", () => {
      saveSignedTxJson(signed("aa".repeat(65)), "t1", cwd);
      expect(readSignedTxJson("t1", cwd).signature).to.equal("aa".repeat(65));
      withFileAppearingAfterCheck(() =>
        expect(() => saveSignedTxJson(signed("bb".repeat(65)), "t1", cwd)).to.throw(/EEXIST/)
      );
      expect(readSignedTxJson("t1", cwd).signature).to.equal("aa".repeat(65));
    });

    it("saveSignedTxJson leaves an identical file untouched, replaces another signature, and never a sent file", () => {
      const file = signedTxPath("t1", cwd);
      saveSignedTxJson(signed("aa".repeat(65)), "t1", cwd);
      const past = new Date("2020-01-01T00:00:00Z");
      fs.utimesSync(file, past, past);
      saveSignedTxJson(signed("aa".repeat(65)), "t1", cwd); // forDefi fetch again: the same answer
      expect(fs.statSync(file).mtime.getTime()).to.equal(past.getTime());
      saveSignedTxJson(signed("bb".repeat(65)), "t1", cwd); // signed again in ForDefi
      expect(readSignedTxJson("t1", cwd).signature).to.equal("bb".repeat(65));
      markSentToChain("t1", cwd);
      expect(() => saveSignedTxJson(signed("cc".repeat(65)), "t1", cwd)).to.throw("Tx already sent to chain");
      expect(readSignedTxJson("t1", cwd)).to.deep.include({ signature: "bb".repeat(65), isSentToChain: true });
    });

    it("writes, marks and rewrites the files of an id as long as the file system allows", () => {
      const id = "a".repeat(239); // its unsigned file name is 255 bytes, the most a file name can have
      saveUnsignedTxJson(recordedAtomic, id, cwd);
      writeUnsignedTxJson({ ...readUnsignedTxJson(id, cwd), forDefiTxId: "fordefi-1" }, id, cwd);
      writeSignedTxJson(signed("aa".repeat(65)), id, cwd);
      markSentToChain(id, cwd);
      expect(isAlreadySentToChain(id, cwd)).to.equal(true);
      expect(readUnsignedTxJson(id, cwd).forDefiTxId).to.equal("fordefi-1");
    });

    it("rewrites keep the permissions of the file they replace, and a new file gets the usual ones", () => {
      saveUnsignedTxJson(recordedAtomic, "t1", cwd);
      const unsignedFile = unsignedTxPath("t1", cwd);
      writeSignedTxJson(signed("aa".repeat(65)), "t1", cwd);
      const signedFile = signedTxPath("t1", cwd);
      const reference = path.join(cwd, "reference");
      fs.writeFileSync(reference, ""); // what a plain write creates under this umask
      const mode = (file: string) => fs.statSync(file).mode & 0o777;
      expect(mode(signedFile)).to.equal(mode(reference));
      fs.chmodSync(unsignedFile, 0o600);
      fs.chmodSync(signedFile, 0o640); // not the temporary file's 0600: the mode must be copied
      writeUnsignedTxJson({ ...readUnsignedTxJson("t1", cwd), forDefiTxId: "fordefi-1" }, "t1", cwd);
      saveSignedTxJson(signed("bb".repeat(65)), "t1", cwd); // forDefi fetch with a new signature
      markSentToChain("t1", cwd);
      expect(mode(unsignedFile)).to.equal(0o600);
      expect(mode(signedFile)).to.equal(0o640);
    });

    it("rewrites leave no temporary file, and a failed rename removes it and keeps what was there", () => {
      saveUnsignedTxJson(recordedAtomic, "t1", cwd);
      writeSignedTxJson(signed("aa".repeat(65)), "t1", cwd);
      markSentToChain("t1", cwd);
      expect(fs.readdirSync(path.dirname(signedTxPath("t1", cwd)))).to.deep.equal(["t1.signedTx.json"]);
      const target = path.join(cwd, "a-directory");
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, "kept"), "");
      expect(() => replaceFile(target, "new content")).to.throw();
      expect(fs.readdirSync(cwd).sort()).to.deep.equal(["ForDefiTxnFiles", "a-directory"]);
      expect(fs.readdirSync(target)).to.deep.equal(["kept"]);
    });
  });

  describe("reading transaction files", () => {
    let cwd: string;
    const goldenDir = path.join(__dirname, "..", "golden");
    const delegate = JSON.parse(fs.readFileSync(path.join(goldenDir, "delegate-file.json"), "utf8")).outcome
      .unsignedTxJson as UnsignedAtomicTxJson;

    beforeEach(() => {
      cwd = fs.mkdtempSync(path.join(os.tmpdir(), "files-test-"));
    });

    afterEach(() => {
      fs.rmSync(cwd, { recursive: true, force: true });
    });

    /** Writes `content` as the file of `id` exactly as given, as another tool or an older version may have. */
    function place(file: string, content: string): void {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }

    it("loads every recorded file, the v4.3.3 one and older shapes as written, unknown fields included", () => {
      const recorded = fs
        .readdirSync(goldenDir)
        .filter((name) => name.endsWith(".json"))
        .map(
          (name) =>
            JSON.parse(fs.readFileSync(path.join(goldenDir, name), "utf8")) as {
              outcome?: { unsignedTxJson?: unknown };
            }
        )
        .flatMap(({ outcome }) => (outcome?.unsignedTxJson === undefined ? [] : [outcome.unsignedTxJson]));
      expect(recorded.length).to.be.greaterThan(15);
      const older = {
        ...delegate,
        // a filled signer (as 5.0.0 writes), a second request, and metadata earlier versions wrote
        signatureRequests: [
          { message: messageOf(delegate), signer: "P-costwo18jma8ppw3nhx5r4ap8clazz0dps7rv5u6wmu4t" },
          { message: "00".repeat(32), signer: "" },
        ],
        usedFee: "1000000",
        txDetails: { nodeId: "NodeID-x", amount: 1 },
        forDefiTxId: "fordefi-1",
      };
      const shapes = [...recorded, PUBLISHED_V433_TX, older];
      shapes.forEach((json, index) => {
        place(unsignedTxPath(`f${index}`, cwd), JSON.stringify(json));
        expect(readUnsignedTxJson(`f${index}`, cwd), String(index)).to.deep.equal(json);
        place(
          signedTxPath(`f${index}`, cwd),
          JSON.stringify({ ...json, signature: "ab".repeat(65), isSentToChain: true })
        );
        expect(readSignedTxJson(`f${index}`, cwd), String(index)).to.deep.equal({
          ...json,
          signature: "ab".repeat(65),
          isSentToChain: true,
        });
      });
      // a rewrite, as forDefi sign makes to record its id, keeps what the tool does not read
      const index = shapes.length - 1;
      writeUnsignedTxJson({ ...readUnsignedTxJson(`f${index}`, cwd), forDefiTxId: "fordefi-2" }, `f${index}`, cwd);
      expect(readUnsignedTxJson(`f${index}`, cwd)).to.deep.equal({ ...older, forDefiTxId: "fordefi-2" });
    });

    it("refuses a file whose fields the tool reads are missing or of the wrong type, naming the file", () => {
      const atomic = JSON.stringify(delegate);
      const cases: [string, string][] = [
        ["not json", "is not valid JSON ("],
        ["null", "is not a transaction file: not a JSON object"],
        ["[]", "is not a transaction file: not a JSON object"],
        ["{}", "is not a transaction file: transactionType is missing"],
        ['{"transactionType":"EVM","message":"aa"}', "is not a transaction file: rawTx is missing"],
        ['{"transactionType":"EVM","rawTx":{}}', "is not a transaction file: message is missing"],
        [
          JSON.stringify({ ...delegate, signatureRequests: {} }),
          "is not a transaction file: signatureRequests[0].message is missing",
        ],
        [
          JSON.stringify({ ...delegate, signatureRequests: [] }),
          "is not a transaction file: signatureRequests[0].message is missing",
        ],
        [
          JSON.stringify({ ...delegate, signatureRequests: [{ message: 5 }] }),
          "is not a transaction file: signatureRequests[0].message is missing",
        ],
        [
          JSON.stringify({ ...delegate, serialization: undefined }),
          "is not a transaction file: serialization is missing",
        ],
        [
          JSON.stringify({ ...delegate, unsignedTransactionBuffer: 5 }),
          "is not a transaction file: unsignedTransactionBuffer is not a string",
        ],
        [
          JSON.stringify({ ...delegate, signatureRequests: [{ message: "aa", signer: 5 }] }),
          "is not a transaction file: signatureRequests[0].signer is not a string",
        ],
        [
          '{"transactionType":"EVM","rawTx":{},"message":"aa","signer":5}',
          "is not a transaction file: signer is not a string",
        ],
        [
          JSON.stringify({ ...delegate, forDefiTxId: 5 }),
          "is not a transaction file: forDefiTxId is not a non-empty string",
        ],
        [
          JSON.stringify({ ...delegate, forDefiTxId: "" }),
          "is not a transaction file: forDefiTxId is not a non-empty string",
        ],
      ];
      for (const [content, problem] of cases) {
        const file = unsignedTxPath("bad", cwd);
        place(file, content);
        expect(() => readUnsignedTxJson("bad", cwd), content).to.throw(`unsignedTx file ${file} ${problem}`);
      }
      const signedFile = signedTxPath("bad", cwd);
      for (const [extra, refusal] of [
        [{ signature: 5 }, "does not contain signature"],
        [
          { signature: "ab".repeat(65), isSentToChain: "yes" },
          "is not a transaction file: isSentToChain is not true or false",
        ],
      ] as [object, string][]) {
        place(signedFile, JSON.stringify({ ...JSON.parse(atomic), ...extra }));
        expect(() => readSignedTxJson("bad", cwd)).to.throw(`signedTx file ${signedFile} ${refusal}`);
      }
      // a sent mark is never missed, whatever form it takes: send stops instead of submitting again
      expect(isAlreadySentToChain("bad", cwd)).to.equal(true);
      place(signedFile, "not json");
      expect(() => isAlreadySentToChain("bad", cwd)).to.throw(`signedTx file ${signedFile} is not valid JSON (`);
    });
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

  it("refuses to build under an id whose signed file is still there, which send would submit instead", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "files-test-"));
    try {
      const { file } = saveUnsignedTxJson(recordedAtomic, "t3", cwd);
      writeSignedTxJson({ ...recordedAtomic, signature: "00".repeat(65) }, "t3", cwd);
      fs.rmSync(file); // the user deletes the unsigned file to build another transaction under the same id
      expect(() => saveUnsignedTxJson(recordedAtomic, "t3", cwd)).to.throw(
        `signedTx file ${path.join(cwd, "ForDefiTxnFiles", "SignedTxns", "t3.signedTx.json")} already exists: ` +
          "transaction t3 was already signed; use another id"
      );
      expect(fs.existsSync(file)).to.equal(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
