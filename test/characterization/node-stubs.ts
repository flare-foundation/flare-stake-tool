/**
 * Synthesized node answers for replay. Every command now checks that the node
 * is on the selected network (`info.getNetworkID`); scenarios recorded before
 * that check whose command did not build a flarejs Context (the C-chain
 * commands, `info` and `send`) have no recorded answer. Every scenario is
 * recorded against localflare, so the answer is localflare's network ID, the
 * same value the other fixtures recorded.
 */
import { networkConfig } from "../../src/chain/network";
import type { Stub } from "./rpc-replay";

export const localflareNetworkIdStub: Stub = {
  match: (reqPath, method) => reqPath === "/ext/info" && method === "info.getNetworkID",
  respond: () => ({ networkID: String(networkConfig("localflare", {}).networkId) }),
};
