import { expect } from "chai";
import http from "http";
import type { AddressInfo } from "net";
import path from "path";
import fs from "fs";
import {
  runCli,
  makeTempDir,
  cleanupTempDir,
  writeTestEnv,
  EWOQ_PUBLIC_KEY_COMPRESSED,
  EWOQ_ETH_ADDRESS,
} from "./cli-helper";
import { runCliAsync } from "../helpers/cli";
import { LOCAL_RPC_URL, waitForLocalNetwork } from "./local-network";

const GENESIS_NODE_ID = "NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg";

describe("CLI read-only commands (with network)", function () {
  this.timeout(180_000);

  let tempDir: string;
  let envPath: string;

  before(async () => {
    await waitForLocalNetwork();
    tempDir = makeTempDir();
    envPath = writeTestEnv(tempDir);
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  describe("init-ctx", () => {
    it("creates ctx.json with public key", () => {
      const subdir = path.join(tempDir, "init-ctx-1");
      fs.mkdirSync(subdir, { recursive: true });
      const result = runCli(["init-ctx", "-p", EWOQ_PUBLIC_KEY_COMPRESSED, "--network", "localflare"], {
        cwd: subdir,
      });
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      const ctxPath = path.join(subdir, "ctx.json");
      expect(fs.existsSync(ctxPath)).to.be.true;
      const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
      expect(ctx.publicKey).to.equal(EWOQ_PUBLIC_KEY_COMPRESSED);
      expect(ctx.network).to.equal("localflare");
    });
  });

  describe("info addresses", () => {
    it("derives addresses from a private key", () => {
      const result = runCli(["info", "addresses", "--get-hacked", "--env-path", envPath, "--network", "localflare"]);
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      expect(result.stdout.toLowerCase()).to.include(EWOQ_ETH_ADDRESS.toLowerCase());
      expect(result.stdout).to.match(/P-localflare1[a-z0-9]+/);
    });
  });

  describe("info balance", () => {
    it("shows the balances of the funded ewoq account", () => {
      const result = runCli(["info", "balance", "--get-hacked", "--env-path", envPath, "--network", "localflare"]);
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      expect(result.stdout.toLowerCase()).to.include("c-chain");
      expect(result.stdout.toLowerCase()).to.include("p-chain");
    });
  });

  describe("info validators", () => {
    it("lists the genesis validator", () => {
      const result = runCli(["info", "validators", "--get-hacked", "--env-path", envPath, "--network", "localflare"]);
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      expect(result.stdout).to.include(GENESIS_NODE_ID);
    });
  });

  describe("custom node URL and API key", () => {
    // Stands in for Flare's API gateway in front of a staging node: forwards to
    // localflare when the x-apikey header is right, answers an HTML 403 page otherwise.
    const API_KEY = "integration-test-key";
    let gateway: http.Server;
    let gatewayUrl: string;
    let forwarded = 0;
    let refused = 0;

    before(async () => {
      gateway = http.createServer((req, res) => {
        if (req.headers["x-apikey"] !== API_KEY) {
          refused++;
          res.writeHead(403, { "content-type": "text/html" });
          res.end('<!doctype html><meta charset="utf-8"><title>403</title>403 Forbidden');
          return;
        }
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => (body += chunk));
        req.on("end", () => {
          forwarded++;
          fetch(`${LOCAL_RPC_URL}${req.url ?? ""}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          })
            .then(async (upstream) => {
              res.writeHead(upstream.status, { "content-type": "application/json" });
              res.end(await upstream.text());
            })
            .catch((error: unknown) => {
              res.writeHead(502);
              res.end(String(error));
            });
        });
      });
      await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
      gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
    });

    after(() => new Promise<void>((resolve) => gateway.close(() => resolve())));

    it("reaches the node through --rpc-url with the key taken from a copied endpoint URL", async () => {
      forwarded = 0;
      const result = await runCliAsync([
        "info",
        "balance",
        "--get-hacked",
        "--env-path",
        envPath,
        "--network",
        "localflare",
        "--rpc-url",
        `${gatewayUrl}/ext/info?x-apikey=${API_KEY}`,
      ]);
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      expect(result.stdout.toLowerCase()).to.include("c-chain");
      expect(result.stdout.toLowerCase()).to.include("p-chain");
      expect(forwarded).to.be.greaterThan(0);
    });

    it("reads FLARE_RPC_URL and FLARE_API_KEY from the environment", async () => {
      forwarded = 0;
      const result = await runCliAsync(["info", "validators", "--network", "localflare"], {
        env: { FLARE_RPC_URL: gatewayUrl, FLARE_API_KEY: API_KEY },
      });
      expect(result.exitCode, `stderr: ${result.stderr}`).to.equal(0);
      expect(result.stdout).to.include(GENESIS_NODE_ID);
      expect(forwarded).to.be.greaterThan(0);
    });

    it("fails with a hint about the API key when the gateway refuses the request", async () => {
      refused = 0;
      const result = await runCliAsync([
        "info",
        "validators",
        "--network",
        "localflare",
        "--rpc-url",
        gatewayUrl,
        "--api-key",
        "wrong-key",
      ]);
      expect(result.exitCode).to.equal(1);
      expect(result.stderr).to.include("(--api-key or the URL's x-apikey; FLARE_API_KEY goes only to FLARE_RPC_URL");
      expect(refused).to.be.greaterThan(0);
    });
  });
});
