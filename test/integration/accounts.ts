/**
 * Fresh, funded test accounts. Every run of the signing suites stakes and
 * delegates, and a P-chain account may only stake to three distinct nodes at a
 * time, so sharing the ewoq key between runs (and with other tools using the
 * same network) would make the tests order-dependent. A random key funded from
 * ewoq on the C-chain is independent of everything that ran before.
 */
import fs from "fs";
import path from "path";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { accountFromPublicKey } from "../../src/chain/keys";
import { EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";
import { LOCAL_RPC_URL } from "./local-network";

export interface FundedAccount {
  privateKeyHex: string;
  publicKeyCompressed: string;
  ethAddress: string;
  pAddress: string;
  /** Writes an env file for `--env-path` into `dir` and returns its path. */
  writeEnv: (dir: string, name?: string) => string;
}

const LOCALFLARE_CHAIN_ID = 162;

export function cChainProvider(): JsonRpcProvider {
  return new JsonRpcProvider(`${LOCAL_RPC_URL}/ext/bc/C/rpc`, LOCALFLARE_CHAIN_ID, { staticNetwork: true });
}

export async function createFundedAccount(cChainFlr = "300000"): Promise<FundedAccount> {
  const provider = cChainProvider();
  const funder = new Wallet(EWOQ_PRIVATE_KEY_HEX, provider);
  const wallet = new Wallet(Wallet.createRandom().privateKey, provider);
  const tx = await funder.sendTransaction({ to: wallet.address, value: parseEther(cChainFlr) });
  await tx.wait();
  const privateKeyHex = wallet.privateKey.slice(2);
  const publicKeyCompressed = wallet.signingKey.compressedPublicKey.slice(2);
  return {
    privateKeyHex,
    publicKeyCompressed,
    ethAddress: wallet.address,
    pAddress: accountFromPublicKey(publicKeyCompressed, "localflare").pAddress,
    writeEnv: (dir, name = "test.env") => {
      const envPath = path.join(dir, name);
      fs.writeFileSync(envPath, `PRIVATE_KEY_HEX="${privateKeyHex}"\n`);
      return envPath;
    },
  };
}
