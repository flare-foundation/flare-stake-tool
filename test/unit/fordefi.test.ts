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
  type UnsignedAtomicTxJson,
} from "../../src/core/files";
import { SigningKey } from "ethers";
import { readGolden } from "../characterization/scenarios";
import { EWOQ_PRIVATE_KEY_HEX, EWOQ_PUBLIC_KEY_COMPRESSED } from "../helpers/keys";

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
    expect(await sendToForDefi("tx1", context, fetchImpl)).to.equal("fordefi-tx-42");
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

  it("refuses a vault whose key is another valid key than the context's", async () => {
    const otherKey = new SigningKey(`0x${"11".repeat(32)}`).compressedPublicKey.slice(2);
    expect(await rejectedWith(sendToForDefi("tx1", context, vaultWith(otherKey)))).to.equal(
      "public key does not match the vault"
    );
  });

  it("accepts the context's key uncompressed or with 0x, as the same key as the vault's compressed one", async () => {
    const uncompressed = new SigningKey(`0x${EWOQ_PRIVATE_KEY_HEX}`).publicKey; // 0x04…
    for (const publicKey of [uncompressed, uncompressed.slice(2), `0x${EWOQ_PUBLIC_KEY_COMPRESSED}`]) {
      expect(await sendToForDefi("tx1", { ...context, publicKey }, vaultWith(EWOQ_PUBLIC_KEY_COMPRESSED))).to.equal(
        "fordefi-tx-42"
      );
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

  it("fetches the signature and writes the signed file", async () => {
    const signature = Buffer.from("ab".repeat(65), "hex");
    const fetchImpl = fakeFetch({
      "GET /api/v1/transactions/fordefi-tx-42": {
        id: "fordefi-tx-42",
        signatures: [{ data: signature.toString("base64") }],
      },
    });
    expect(await fetchForDefiSignature("tx1", fetchImpl)).to.equal("ab".repeat(65));
    const signed = readSignedTxJson("tx1");
    expect(signed.signature).to.equal("ab".repeat(65));
    expect(signed.forDefiTxId).to.equal("fordefi-tx-42");
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
