import { expect } from "chai";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fetchForDefiSignature, getVaultPublicKey, sendToForDefi, type FetchLike } from "../../src/app/fordefi";
import {
  readSignedTxJson,
  readUnsignedTxJson,
  saveUnsignedTxJson,
  writeUnsignedTxJson,
  type UnsignedAtomicTxJson,
  type UnsignedEvmTxJson,
} from "../../src/core/files";
import { accountFromPublicKey } from "../../src/chain/keys";
import { networkConfig } from "../../src/chain/network";
import { describeError } from "../../src/output";
import { SigningKey, Transaction, getBytes } from "ethers";
import { readGolden } from "../characterization/scenarios";
import { EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED, signMessageHash } from "../helpers/keys";
import { recoverPublicKey } from "../../src/core/signing/signature";

/** The ForDefi client reads ./token and ./private.pem from the working directory and talks to api.fordefi.com. */
describe("app/fordefi", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fordefi-test-"));
  const originalCwd = process.cwd();
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  // a real unsigned file: forDefi sign refuses one whose message is not the hash of its transaction
  const { forDefiHash: _hash, ...unsigned } = readGolden("exportCP-file").outcome
    .unsignedTxJson as UnsignedAtomicTxJson;
  const vaultId = "1dafbe27-cdb1-4c8c-9ea6-fdf43f5d7242";
  const context = {
    wallet: "publicKey" as const,
    publicKey: EWOQ_PUBLIC_KEY_COMPRESSED,
    network: "localflare",
    vaultId,
  };
  const calls: { url: string; init: RequestInit }[] = [];

  function fakeFetch(responses: Record<string, unknown>): FetchLike {
    return ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      const key = `${init.method} ${new URL(url).pathname}`;
      const body = responses[key];
      if (body === undefined) throw new Error(`unexpected request ${key}`);
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }) as FetchLike;
  }

  before(() => {
    process.chdir(cwd);
    fs.writeFileSync("token", "secret-token\n");
    fs.writeFileSync("private.pem", privateKey.export({ type: "pkcs8", format: "pem" }));
    saveUnsignedTxJson(unsigned, "tx1");
  });

  after(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("reads the vault's compressed public key", async () => {
    const fetchImpl = fakeFetch({
      [`GET /api/v1/vaults/${vaultId}`]: {
        id: vaultId,
        public_key_compressed: Buffer.from(EWOQ_PUBLIC_KEY_COMPRESSED, "hex").toString("base64"),
      },
    });
    expect(await getVaultPublicKey(vaultId, fetchImpl)).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
    expect(calls.at(-1)?.init.headers).to.deep.include({ Authorization: "Bearer secret-token" });
  });

  it("posts the message hash as a black-box signature request, signed with the API key, and records the ForDefi id", async () => {
    const fetchImpl = fakeFetch({
      [`GET /api/v1/vaults/${vaultId}`]: {
        id: vaultId,
        public_key_compressed: Buffer.from(EWOQ_PUBLIC_KEY_COMPRESSED, "hex").toString("base64"),
      },
      "POST /api/v1/transactions": { id: "fordefi-tx-42" },
    });
    expect(await sendToForDefi("tx1", context, fetchImpl)).to.deep.equal({
      forDefiTxId: "fordefi-tx-42",
      forDefiHash: Buffer.from(unsigned.signatureRequests[0]!.message, "hex").toString("base64"),
    });
    const post = calls.at(-1)!;
    const body = JSON.parse(post.init.body as string);
    expect(body).to.deep.equal({
      vault_id: vaultId,
      signer_type: "api_signer",
      type: "black_box_signature",
      details: {
        format: "hash_binary",
        hash_binary: Buffer.from(unsigned.signatureRequests[0]!.message, "hex").toString("base64"),
      },
    });
    const headers = post.init.headers as Record<string, string>;
    const payload = `/api/v1/transactions|${headers["X-Timestamp"]}|${post.init.body as string}`;
    expect(crypto.createVerify("SHA256").update(payload).verify(publicKey, headers["X-Signature"]!, "base64")).to.equal(
      true
    );
    expect(readUnsignedTxJson("tx1").forDefiTxId).to.equal("fordefi-tx-42");
  });

  /** A ForDefi answering the vault lookup with `vaultKeyHex` (base64, as ForDefi sends it) and the signature request. */
  const vaultWith = (vaultKeyHex: string) =>
    fakeFetch({
      [`GET /api/v1/vaults/${vaultId}`]: {
        id: vaultId,
        public_key_compressed: Buffer.from(vaultKeyHex, "hex").toString("base64"),
      },
      "POST /api/v1/transactions": { id: "fordefi-tx-42" }, // the id the later tests fetch from tx1
    });

  it("refuses a file whose message is not the hash of its transaction, before any request to ForDefi", async () => {
    const other = readGolden("delegate-file").outcome.unsignedTxJson as UnsignedAtomicTxJson;
    saveUnsignedTxJson({ ...unsigned, signatureRequests: other.signatureRequests }, "tampered");
    const requests = calls.length;
    expect(await rejectedWith(sendToForDefi("tampered", context, fakeFetch({})))).to.match(
      /^The file's message [0-9a-f]{64} is not the hash of its transaction \([0-9a-f]{64}\); rebuild the file$/
    );
    expect(calls.length).to.equal(requests);
  });

  it("refuses a file whose forDefiHash is not its transaction's, before any request to ForDefi", async () => {
    const other = readGolden("delegate-file").outcome.unsignedTxJson as UnsignedAtomicTxJson;
    // written as it is: saving recomputes the hash
    writeUnsignedTxJson({ ...unsigned, forDefiHash: other.forDefiHash }, "stale-hash");
    const requests = calls.length;
    expect(await rejectedWith(sendToForDefi("stale-hash", context, fakeFetch({})))).to.match(
      /^The file's forDefiHash \S+ is not the hash of its transaction \(\S+\); rebuild the file$/
    );
    expect(calls.length).to.equal(requests);
  });

  it("refuses a file built for another account than the vault's, before anything is posted, atomic or EVM", async () => {
    const other = accountFromPublicKey(new SigningKey(`0x${"22".repeat(32)}`).compressedPublicKey, "localflare");
    const ewoq = accountFromPublicKey(EWOQ_PUBLIC_KEY_COMPRESSED, "localflare");
    const { forDefiHash: _evmHash, ...evm } = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedEvmTxJson;
    saveUnsignedTxJson(
      { ...unsigned, signatureRequests: [{ ...unsigned.signatureRequests[0]!, signer: other.pAddress }] },
      "for-other"
    );
    saveUnsignedTxJson({ ...evm, signer: other.cAddress }, "evm-for-other");
    const posted = () => calls.filter(({ init }) => init.method === "POST").length;
    const before = posted();
    for (const [id, recorded, actual] of [
      ["for-other", other.pAddress, ewoq.pAddress],
      ["evm-for-other", other.cAddress, ewoq.cAddress],
    ] as const) {
      expect(await rejectedWith(sendToForDefi(id, context, vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED))), id).to.equal(
        `Transaction ${id} was built for ${recorded}, but ForDefi vault ${vaultId} holds ${actual}; ` +
          "sign it with the context and vault of the account it was built for"
      );
    }
    expect(posted()).to.equal(before);
  });

  it("refuses a file of another network than the selected one, before anything is read from or posted to ForDefi", async () => {
    const { forDefiHash: _evmHash, ...evm } = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedEvmTxJson;
    saveUnsignedTxJson(evm, "evm-localflare");
    const requests = calls.length;
    // the context's network, and a network selected over it (--network)
    expect(await rejectedWith(sendToForDefi("tx1", { ...context, network: "costwo" }, fakeFetch({})))).to.equal(
      "Transaction tx1 is for network id 162, not costwo (114); select its network with --network"
    );
    expect(
      await rejectedWith(sendToForDefi("evm-localflare", context, fakeFetch({}), networkConfig("songbird", {})))
    ).to.equal("Transaction evm-localflare is for chain id 162, not songbird (19); select its network with --network");
    expect(calls.length, "no request to ForDefi").to.equal(requests);
  });

  it("refuses an unprotected legacy EVM file (no chain id), whose signature every network would take", async () => {
    const rawTx = { type: 0, nonce: 1, gasPrice: 1, gasLimit: 21_000, to: `0x${"22".repeat(20)}`, value: "1" };
    const message = Transaction.from(rawTx).unsignedHash.slice(2);
    saveUnsignedTxJson({ transactionType: "EVM", rawTx, message }, "unprotected");
    const requests = calls.length;
    for (const network of ["flare", "songbird"] as const) {
      expect(
        await rejectedWith(
          sendToForDefi("unprotected", context, vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED), networkConfig(network, {}))
        ),
        network
      ).to.match(/^Transaction unprotected is for chain id 0, not (flare \(14\)|songbird \(19\)); select its network/);
    }
    expect(calls.length, "no request to ForDefi").to.equal(requests);
  });

  it("posts a file from an earlier version, which records no account", async () => {
    saveUnsignedTxJson(
      { ...unsigned, signatureRequests: [{ ...unsigned.signatureRequests[0]!, signer: "" }] },
      "older"
    );
    expect(await sendToForDefi("older", context, vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED))).to.include({
      forDefiTxId: "fordefi-tx-42",
    });
  });

  it("refuses a vault whose key is another valid key than the context's", async () => {
    const otherKey = new SigningKey(`0x${"11".repeat(32)}`).compressedPublicKey.slice(2);
    expect(await rejectedWith(sendToForDefi("tx1", context, vaultWith(otherKey)))).to.equal(
      "public key does not match the vault"
    );
  });

  it("accepts the context's key uncompressed or with 0x, as the same key as the vault's compressed one", async () => {
    const uncompressed = new SigningKey(`0x${EWOQ_PRIVATE_KEY_HEX}`).publicKey; // 0x04…
    for (const publicKey of [uncompressed, uncompressed.slice(2), `0x${EWOQ_PUBLIC_KEY_COMPRESSED}`]) {
      expect(await sendToForDefi("tx1", { ...context, publicKey }, vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED))).to.include({
        forDefiTxId: "fordefi-tx-42",
      });
    }
  });

  it("refuses a malformed key in the context or from the vault, naming which, before anything is posted", async () => {
    const posted = () => calls.filter(({ init }) => init.method === "POST").length;
    const before = posted();
    expect(
      await rejectedWith(sendToForDefi("tx1", { ...context, publicKey: "zz" }, vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED)))
    ).to.equal("The context's publicKey is not a valid public key (Invalid public key: not a hex string)");
    expect(await rejectedWith(sendToForDefi("tx1", context, vaultWith("02" + "00".repeat(32))))).to.match(
      new RegExp(`^The public key of ForDefi vault ${vaultId} is not a valid public key \\(Invalid public key: `)
    );
    expect(posted()).to.equal(before);
  });

  /** ForDefi answering the lookup of fordefi-tx-42 with `signatureHex`, base64 as ForDefi sends it. */
  const signatureAnswer = (signatureHex: string) =>
    fakeFetch({
      "GET /api/v1/transactions/fordefi-tx-42": {
        id: "fordefi-tx-42",
        signatures: [{ data: Buffer.from(signatureHex, "hex").toString("base64") }],
      },
    });

  it("fetches the signature and writes the signed file", async () => {
    const signature = signMessageHash(unsigned.signatureRequests[0]!.message);
    expect(await fetchForDefiSignature("tx1", signatureAnswer(signature))).to.equal(signature);
    const signed = readSignedTxJson("tx1");
    expect(signed.signature).to.equal(signature);
    expect(signed.forDefiTxId).to.equal("fordefi-tx-42");
  });

  it("refuses a signature over another transaction or by another key, and keeps the signature it has", async () => {
    const message = unsigned.signatureRequests[0]!.message;
    const good = signMessageHash(message);
    saveUnsignedTxJson({ ...unsigned, forDefiTxId: "fordefi-tx-42" }, "tx-checked");
    await fetchForDefiSignature("tx-checked", signatureAnswer(good));
    const other = accountFromPublicKey(new SigningKey(`0x${"22".repeat(32)}`).compressedPublicKey, "localflare");
    const recordedFor = unsigned.signatureRequests[0]!.signer;
    // the vault's key over another hash recovers some other key; another key over this hash recovers that key
    const otherHash = readGolden("delegate-file").outcome.unsignedTxJson as UnsignedAtomicTxJson;
    const overAnother = signMessageHash(otherHash.signatureRequests[0]!.message);
    for (const [signature, actual] of [
      [
        overAnother,
        accountFromPublicKey(recoverPublicKey(getBytes(`0x${message}`), getBytes(`0x${overAnother}`)), "localflare")
          .pAddress,
      ],
      [signMessageHash(message, "22".repeat(32)), other.pAddress],
    ] as const) {
      expect(await rejectedWith(fetchForDefiSignature("tx-checked", signatureAnswer(signature)))).to.equal(
        `Transaction tx-checked was built for ${recordedFor}, but ForDefi answered a signature of ${actual} ` +
          "(over another transaction, or by another key); the signed file is not written"
      );
    }
    // r = 0: no key recovers
    expect(await rejectedWith(fetchForDefiSignature("tx-checked", signatureAnswer("00".repeat(64) + "00")))).to.match(
      /^ForDefi answered a signature of no key for transaction tx-checked \(.+\); the signed file is not written$/
    );
    expect(readSignedTxJson("tx-checked").signature, "the good one kept").to.equal(good);
  });

  it("reports a broken file as such, not as the signature's fault, and quotes none of it", async () => {
    // a serialization that is not JSON: V8's error quotes its first 10 characters
    writeUnsignedTxJson({ ...unsigned, serialization: "d133724945abcdef", forDefiTxId: "fordefi-tx-42" }, "tx-broken");
    const answer = signatureAnswer(signMessageHash(unsigned.signatureRequests[0]!.message));
    const error = await fetchForDefiSignature("tx-broken", answer).then(
      () => expect.fail("fetched for a broken file"),
      (thrown: unknown) => thrown
    );
    expect(describeError(error)).to.equal("Unexpected token 'd' in JSON");
    expect(fs.existsSync(path.join("ForDefiTxnFiles", "SignedTxns", "tx-broken.signedTx.json"))).to.equal(false);
  });

  it("checks the signature of a C-chain file too", async () => {
    const { forDefiHash: _evmHash, ...evm } = readGolden("withdrawal-file").outcome.unsignedTxJson as UnsignedEvmTxJson;
    saveUnsignedTxJson({ ...evm, forDefiTxId: "fordefi-tx-42" }, "evm-checked");
    expect(
      await rejectedWith(
        fetchForDefiSignature("evm-checked", signatureAnswer(signMessageHash(evm.message, "22".repeat(32))))
      )
    ).to.match(
      /^Transaction evm-checked was built for 0x8db97C7cEcE249c2b98bDC0226Cc4C2A57BF52FC, but ForDefi answered a signature of 0x/
    );
    const good = signMessageHash(evm.message);
    expect(await fetchForDefiSignature("evm-checked", signatureAnswer(good))).to.equal(good);
  });

  /** Answers with the given HTTP status per request; status 200 bodies are JSON. */
  function statusFetch(responses: Record<string, { status: number; statusText?: string; body: string }>): FetchLike {
    return ((url: string, init: RequestInit) => {
      const key = `${init.method} ${new URL(url).pathname}`;
      const answer = responses[key];
      if (answer === undefined) throw new Error(`unexpected request ${key}`);
      return Promise.resolve(new Response(answer.body, { status: answer.status, statusText: answer.statusText ?? "" }));
    }) as FetchLike;
  }

  const rejectedWith = async (promise: Promise<unknown>): Promise<string> =>
    promise.then(
      () => expect.fail("should have thrown"),
      (error: unknown) => (error as Error).message
    );

  it("reports a refused vault lookup with its HTTP status instead of a missing key", async () => {
    const fetchImpl = statusFetch({
      [`GET /api/v1/vaults/${vaultId}`]: { status: 401, statusText: "Unauthorized", body: '{"title":"Invalid token"}' },
    });
    expect(await rejectedWith(sendToForDefi("tx1", context, fetchImpl))).to.equal(
      `ForDefi vault lookup (${vaultId}) failed: HTTP 401 Unauthorized: {"title":"Invalid token"}`
    );
  });

  it("masks the API token in a ForDefi answer, and never saves a transaction id that holds it", async () => {
    const refused = statusFetch({
      [`GET /api/v1/vaults/${vaultId}`]: {
        status: 401,
        statusText: "Unauthorized",
        body: '{"diagnostic":"refused Bearer secret-token"}',
      },
    });
    const error = await sendToForDefi("tx1", context, refused).then(
      () => expect.fail("should have thrown"),
      (thrown: unknown) => describeError(thrown)
    );
    expect(error).to.equal(
      `ForDefi vault lookup (${vaultId}) failed: HTTP 401 Unauthorized: {"diagnostic":"refused Bearer ***"}`
    );
    const before = readUnsignedTxJson("tx1").forDefiTxId;
    const reflecting = fakeFetch({
      [`GET /api/v1/vaults/${vaultId}`]: {
        id: vaultId,
        public_key_compressed: Buffer.from(EWOQ_PUBLIC_KEY_COMPRESSED, "hex").toString("base64"),
      },
      "POST /api/v1/transactions": { id: "tx-secret-token" },
    });
    expect(await rejectedWith(sendToForDefi("tx1", context, reflecting))).to.equal(
      "ForDefi answered a transaction id that holds a secret (such as the API token); it is not saved"
    );
    expect(readUnsignedTxJson("tx1").forDefiTxId, "the file as it was").to.equal(before);
  });

  it("masks the token before cutting a ForDefi answer short, so that no part of it prints", async () => {
    saveUnsignedTxJson(unsigned, "tx-cut");
    saveUnsignedTxJson({ ...unsigned, forDefiTxId: "fordefi-tx-42" }, "tx-cut-posted");
    const x = (length: number) => "X".repeat(length);
    // the token straddles the 300 characters of the body printed: cut first, "secre" would print unmasked
    const refused = statusFetch({
      [`GET /api/v1/vaults/${vaultId}`]: { status: 401, statusText: "Unauthorized", body: `${x(295)}secret-token` },
    });
    expect(await rejectedWith(getVaultPublicKey(vaultId, refused))).to.equal(
      `ForDefi vault lookup (${vaultId}) failed: HTTP 401 Unauthorized: ${x(295)}***`
    );
    const notJson = statusFetch({ [`GET /api/v1/vaults/${vaultId}`]: { status: 200, body: `${x(295)}secret-token` } });
    expect(await rejectedWith(getVaultPublicKey(vaultId, notJson))).to.equal(
      `ForDefi vault lookup (${vaultId}) did not answer with JSON: ${x(295)}***`
    );
    // the 200 characters of JSON printed of an answer without a transaction id, and of a signature that isn't one
    const vault = vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED);
    const withoutId: FetchLike = (url, init) =>
      init?.method === "POST"
        ? Promise.resolve(new Response(JSON.stringify({ note: `${x(185)}secret-token` }), { status: 200 }))
        : vault(url, init);
    expect(await rejectedWith(sendToForDefi("tx-cut", context, withoutId))).to.equal(
      `ForDefi did not return a transaction id: {"note":"${x(185)}***"}`
    );
    const badSignature = fakeFetch({
      "GET /api/v1/transactions/fordefi-tx-42": {
        id: "fordefi-tx-42",
        signatures: [{ data: `${x(190)}secret-token` }],
      },
    });
    expect(await rejectedWith(fetchForDefiSignature("tx-cut-posted", badSignature))).to.equal(
      `ForDefi answered a signature that is not 65 bytes of base64: "${x(190)}***"`
    );
  });

  it("reports a failed signature request and leaves the unsigned file as it was", async () => {
    const before = readUnsignedTxJson("tx1").forDefiTxId;
    const vault = {
      id: vaultId,
      public_key_compressed: Buffer.from(EWOQ_PUBLIC_KEY_COMPRESSED, "hex").toString("base64"),
    };
    const fetchImpl = statusFetch({
      [`GET /api/v1/vaults/${vaultId}`]: { status: 200, body: JSON.stringify(vault) },
      "POST /api/v1/transactions": { status: 500, statusText: "Internal Server Error", body: "" },
    });
    expect(await rejectedWith(sendToForDefi("tx1", context, fetchImpl))).to.equal(
      "ForDefi signature request failed: HTTP 500 Internal Server Error"
    );
    expect(readUnsignedTxJson("tx1").forDefiTxId).to.equal(before);
  });

  it("reports a failed transaction lookup and an answer that is not JSON", async () => {
    const notFound = statusFetch({
      "GET /api/v1/transactions/fordefi-tx-42": { status: 404, statusText: "Not Found", body: "no such transaction" },
    });
    expect(await rejectedWith(fetchForDefiSignature("tx1", notFound))).to.equal(
      "ForDefi transaction lookup (fordefi-tx-42) failed: HTTP 404 Not Found: no such transaction"
    );
    const htmlPage = statusFetch({
      "GET /api/v1/transactions/fordefi-tx-42": { status: 200, body: "<html>maintenance</html>" },
    });
    expect(await rejectedWith(fetchForDefiSignature("tx1", htmlPage))).to.equal(
      "ForDefi transaction lookup (fordefi-tx-42) did not answer with JSON: <html>maintenance</html>"
    );
  });

  it("names ForDefi's state when the transaction is not signed yet", async () => {
    const fetchImpl = fakeFetch({
      "GET /api/v1/transactions/fordefi-tx-42": { id: "fordefi-tx-42", state: "waiting_for_approval", signatures: [] },
    });
    expect(await rejectedWith(fetchForDefiSignature("tx1", fetchImpl))).to.equal(
      "Transaction is not signed yet (ForDefi state: waiting_for_approval); run forDefi fetch again once it is"
    );
  });

  it("reports a transaction that is not signed yet", async () => {
    const fetchImpl = fakeFetch({ "GET /api/v1/transactions/fordefi-tx-42": { id: "fordefi-tx-42", signatures: [] } });
    try {
      await fetchForDefiSignature("tx1", fetchImpl);
      expect.fail("should have thrown");
    } catch (error) {
      expect((error as Error).message).to.match(/not signed yet/);
    }
  });

  it("refuses a context without a vault id and a vault answer without a public key", async () => {
    expect(await rejectedWith(sendToForDefi("tx1", { ...context, vaultId: undefined }, fakeFetch({})))).to.equal(
      "vaultId not found in context"
    );
    const fetchImpl = fakeFetch({ [`GET /api/v1/vaults/${vaultId}`]: { id: vaultId } });
    expect(await rejectedWith(getVaultPublicKey(vaultId, fetchImpl))).to.equal(
      "public_key_compressed not found in vault response"
    );
  });

  it("refuses answers whose fields it uses are of the wrong type, and an answer that is not an object", async () => {
    expect(
      await rejectedWith(getVaultPublicKey(vaultId, fakeFetch({ [`GET /api/v1/vaults/${vaultId}`]: null })))
    ).to.equal(`ForDefi vault lookup (${vaultId}) did not answer with a JSON object: null`);
    const numericKey = fakeFetch({ [`GET /api/v1/vaults/${vaultId}`]: { id: vaultId, public_key_compressed: 5 } });
    expect(await rejectedWith(getVaultPublicKey(vaultId, numericKey))).to.equal(
      "public_key_compressed not found in vault response"
    );
    const numericId = vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED);
    const withNumericId: FetchLike = (url, init) =>
      init?.method === "POST" ? Promise.resolve(new Response('{"id":42}', { status: 200 })) : numericId(url, init);
    const before = readUnsignedTxJson("tx1").forDefiTxId;
    expect(await rejectedWith(sendToForDefi("tx1", context, withNumericId))).to.equal(
      'ForDefi did not return a transaction id: {"id":42}'
    );
    expect(readUnsignedTxJson("tx1").forDefiTxId).to.equal(before);
  });

  it("refuses a signature that is not 65 bytes of base64, and reads signatures that are not a list as none", async () => {
    const lookup = "GET /api/v1/transactions/fordefi-tx-42";
    for (const data of [5, Buffer.alloc(64, 1).toString("base64"), "not base64!"]) {
      const fetchImpl = fakeFetch({ [lookup]: { id: "fordefi-tx-42", signatures: [{ data }] } });
      expect(await rejectedWith(fetchForDefiSignature("tx1", fetchImpl)), String(data)).to.match(
        /^ForDefi answered a signature that is not 65 bytes of base64: /
      );
    }
    const notAList = fakeFetch({ [lookup]: { id: "fordefi-tx-42", signatures: { data: "x" } } });
    expect(await rejectedWith(fetchForDefiSignature("tx1", notAList))).to.match(/^Transaction is not signed yet/);
  });

  it("puts the ForDefi id and the vault id into the request path as one path segment", async () => {
    saveUnsignedTxJson({ ...unsigned, forDefiTxId: "../vaults/other" }, "odd-fordefi-id");
    await rejectedWith(fetchForDefiSignature("odd-fordefi-id", fakeFetch({})));
    expect(new URL(calls.at(-1)!.url).pathname).to.equal("/api/v1/transactions/..%2Fvaults%2Fother");
    await rejectedWith(getVaultPublicKey("../transactions", fakeFetch({})));
    expect(new URL(calls.at(-1)!.url).pathname).to.equal("/api/v1/vaults/..%2Ftransactions");
  });

  it("refuses a signature request answered without a transaction id, and records none", async () => {
    saveUnsignedTxJson(unsigned, "tx-no-id");
    const fetchImpl = fakeFetch({
      [`GET /api/v1/vaults/${vaultId}`]: {
        id: vaultId,
        public_key_compressed: Buffer.from(EWOQ_PUBLIC_KEY_COMPRESSED, "hex").toString("base64"),
      },
      "POST /api/v1/transactions": { state: "created" },
    });
    expect(await rejectedWith(sendToForDefi("tx-no-id", context, fetchImpl))).to.equal(
      'ForDefi did not return a transaction id: {"state":"created"}'
    );
    expect(readUnsignedTxJson("tx-no-id").forDefiTxId).to.equal(undefined);
  });

  it("refuses to fetch the signature of a transaction never sent to ForDefi", async () => {
    saveUnsignedTxJson(unsigned, "tx-not-sent");
    expect(await rejectedWith(fetchForDefiSignature("tx-not-sent", fakeFetch({})))).to.equal(
      "Transaction tx-not-sent was not sent to ForDefi (no forDefiTxId in the unsigned file)"
    );
  });
});
