import { expect } from "chai";
import { rpcCall } from "../helpers/rpc";
import { LOCAL_RPC_URL, getCurrentValidators, getUpgrades, waitForLocalNetwork } from "./local-network";

describe("local network sanity", function () {
  this.timeout(120_000);

  before(async () => {
    await waitForLocalNetwork();
  });

  it("reports network ID 162 (localflare)", async () => {
    const result = await rpcCall<{ networkID: string }>(LOCAL_RPC_URL, "/ext/info", "info.getNetworkID");
    expect(result.networkID).to.equal("162");
  });

  it("P-chain has the genesis validator", async () => {
    const nodeIds = (await getCurrentValidators()).map((v) => v.nodeID);
    expect(nodeIds).to.include("NodeID-7Xhw2mDxuDS44j42TCB6U5579esbSt3Lg");
  });

  it("reports the Etna and Helicon activation times", async () => {
    const upgrades = await getUpgrades();
    expect(upgrades.etnaTime).to.be.a("string");
    // Helicon may be unscheduled on some networks; when present it must parse as a date.
    if (upgrades.heliconTime !== undefined) {
      expect(Number.isNaN(new Date(upgrades.heliconTime).getTime())).to.equal(false);
    }
  });
});
