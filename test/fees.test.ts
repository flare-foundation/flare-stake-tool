import { expect } from "chai";
import { Transaction } from "ethers";
import {
  DEFAULT_GAS_LIMIT,
  DEFAULT_MAX_FEE_PER_GAS,
  DEFAULT_MAX_PRIORITY_FEE_PER_GAS,
  EvmOperation,
  LIST_OPERATIONS,
  MAX_LIST_ENTRIES,
  listGasLimit,
  normalizeAddressList,
  resolveEvmFees,
} from "../src/constants/fees";

const GWEI = 1_000_000_000;

/** The Flare C-chain rejects anything whose fee cap is under the base fee floor. */
const BASE_FEE_FLOOR = 500 * GWEI;

const OPERATIONS = Object.keys(DEFAULT_MAX_FEE_PER_GAS) as EvmOperation[];

/**
 * Gas measured on Flare mainnet with eth_estimateGas, writing to an address
 * that had no list stored yet.
 */
const MEASURED_LIST_GAS: [number, number][] = [
  [1, 115_762],
  [5, 318_105],
  [10, 572_323],
  [25, 1_334_979],
  [50, 2_337_699],
];

describe("constants/fees", () => {
  describe("defaults", () => {
    it("keeps every fee cap well above the C-chain base fee floor", () => {
      for (const operation of OPERATIONS) {
        expect(DEFAULT_MAX_FEE_PER_GAS[operation], operation).to.be.greaterThan(BASE_FEE_FLOOR * 4);
      }
    });

    it("keeps the tip at or below every fee cap", () => {
      for (const operation of OPERATIONS) {
        expect(DEFAULT_MAX_PRIORITY_FEE_PER_GAS, operation).to.be.at.most(DEFAULT_MAX_FEE_PER_GAS[operation]);
      }
    });

    it("uses the fee cap belonging to the operation", () => {
      for (const operation of OPERATIONS) {
        expect(resolveEvmFees(operation).maxFeePerGas, operation).to.equal(DEFAULT_MAX_FEE_PER_GAS[operation]);
      }
    });

    it("keeps every value-moving operation spike-proof past the worst observed base fee", () => {
      // Flare's base fee peaked at 5420 gwei during a reward-claiming rush.
      const WORST_OBSERVED_BASE_FEE = 5_420 * GWEI;
      for (const operation of ["claim", "withdrawal", "custom"] as const) {
        expect(DEFAULT_MAX_FEE_PER_GAS[operation], operation).to.be.greaterThan(
          WORST_OBSERVED_BASE_FEE + DEFAULT_MAX_PRIORITY_FEE_PER_GAS
        );
      }
    });

    it("keeps every fee field a safe integer, so the tx JSON round-trips", () => {
      for (const operation of OPERATIONS) {
        const fees = resolveEvmFees(operation);
        for (const [field, value] of Object.entries(fees)) {
          expect(Number.isSafeInteger(value), `${operation}.${field} is not a safe integer`).to.be.true;
        }
      }
    });

    it("builds an EIP-1559 transaction for every operation", () => {
      for (const operation of OPERATIONS) {
        expect(resolveEvmFees(operation).type, operation).to.equal(2);
      }
    });

    it("uses the gas limit belonging to the operation", () => {
      for (const operation of Object.keys(DEFAULT_GAS_LIMIT) as (keyof typeof DEFAULT_GAS_LIMIT)[]) {
        expect(resolveEvmFees(operation).gasLimit, operation).to.equal(DEFAULT_GAS_LIMIT[operation]);
      }
    });
  });

  describe("determinism", () => {
    // ForDefi transactions may be built independently by several signers, who
    // all have to arrive at the same hash.
    it("produces identical hashes for independently built identical transactions", () => {
      const build = () =>
        Transaction.from({
          nonce: 7,
          to: `0x${"11".repeat(20)}`,
          data: "0xdeadbeef",
          chainId: 14,
          ...resolveEvmFees("claim"),
        }).unsignedHash;
      expect(build()).to.equal(build());
    });

    it("produces identical hashes when the same overrides are passed", () => {
      const overrides = { maxFeePerGas: "3000", priorityFeePerGas: "100", gasLimit: "250000" };
      expect(resolveEvmFees("claim", overrides)).to.deep.equal(resolveEvmFees("claim", overrides));
    });

    it("produces a different hash when overrides differ", () => {
      const a = resolveEvmFees("claim", { maxFeePerGas: "3000" });
      const b = resolveEvmFees("claim", { maxFeePerGas: "4000" });
      expect(a.maxFeePerGas).to.not.equal(b.maxFeePerGas);
    });
  });

  describe("overrides", () => {
    it("converts the fee options from gwei to wei", () => {
      const fees = resolveEvmFees("claim", { maxFeePerGas: "3000", priorityFeePerGas: "100" });
      expect(fees.maxFeePerGas).to.equal(3000 * GWEI);
      expect(fees.maxPriorityFeePerGas).to.equal(100 * GWEI);
    });

    it("takes the gas limit in gas units, not gwei", () => {
      expect(resolveEvmFees("claim", { gasLimit: "250000" }).gasLimit).to.equal(250_000);
    });

    it("falls back to the default when an override is absent or empty", () => {
      for (const override of [{}, { maxFeePerGas: undefined }, { maxFeePerGas: "" }]) {
        expect(resolveEvmFees("claim", override).maxFeePerGas).to.equal(DEFAULT_MAX_FEE_PER_GAS.claim);
      }
    });

    it("rejects a tip above the fee cap", () => {
      expect(() => resolveEvmFees("claim", { maxFeePerGas: "100", priorityFeePerGas: "500" })).to.throw(
        /cannot exceed max fee per gas/
      );
    });

    for (const bad of ["abc", "-5", "0", "1.5", "1e400"]) {
      it(`rejects ${JSON.stringify(bad)} as a gas limit`, () => {
        expect(() => resolveEvmFees("claim", { gasLimit: bad })).to.throw(/must be a positive integer/);
      });
    }
  });

  describe("address list gas limits", () => {
    it("covers gas measured on mainnet for every list length", () => {
      for (const [entries, measured] of MEASURED_LIST_GAS) {
        expect(listGasLimit(entries), `${entries} entries`).to.be.greaterThan(measured);
      }
    });

    it("leaves headroom for clearing whatever was stored before", () => {
      // Setting a list also clears the previous one, which the arguments do not
      // reveal, so the limit has to sit well above the write-only measurement.
      for (const [entries, measured] of MEASURED_LIST_GAS) {
        expect(listGasLimit(entries) / measured, `${entries} entries`).to.be.greaterThan(1.3);
      }
    });

    it("grows with the list, so a long list is not capped at the floor", () => {
      expect(listGasLimit(50)).to.be.greaterThan(listGasLimit(25));
      expect(listGasLimit(25)).to.be.greaterThan(listGasLimit(10));
    });

    it("covers clearing a stored list, measured on a mainnet fork", () => {
      // Clearing a stored 50-entry list cost 573,340 gas, and replacing 50 with
      // 2 cost 620,212. The stored length is invisible from the arguments, so
      // the floor has to carry it.
      expect(listGasLimit(0)).to.be.greaterThan(573_340);
      expect(listGasLimit(2)).to.be.greaterThan(620_212);
    });

    it("is used by the operations that set a list", () => {
      for (const operation of LIST_OPERATIONS) {
        expect(resolveEvmFees(operation, {}, 25).gasLimit, operation).to.equal(listGasLimit(25));
      }
    });

    it("stays reproducible for the same list length", () => {
      expect(resolveEvmFees("setClaimExecutors", {}, 25)).to.deep.equal(resolveEvmFees("setClaimExecutors", {}, 25));
    });

    it("rejects a nonsensical list length", () => {
      expect(() => listGasLimit(-1)).to.throw(/non-negative integer/);
      expect(() => listGasLimit(1.5)).to.throw(/non-negative integer/);
    });
  });

  describe("overflow", () => {
    it("rejects a gwei value that does not fit exactly in wei", () => {
      // Passes the gwei-side integer check, but 9007200 * 1e9 is past the point
      // where a number stops being exact, and the tx JSON stores wei.
      expect(() => resolveEvmFees("claim", { maxFeePerGas: "9007200" })).to.throw(/exceeds the largest/);
    });

    it("accepts the largest gwei value that still converts exactly", () => {
      const fees = resolveEvmFees("claim", { maxFeePerGas: "9007199" });
      expect(Number.isSafeInteger(fees.maxFeePerGas)).to.be.true;
    });
  });

  describe("supported list length", () => {
    it("accepts a list up to the supported maximum", () => {
      expect(() => listGasLimit(MAX_LIST_ENTRIES)).to.not.throw();
    });

    it("refuses a longer list even when --gas-limit is passed", () => {
      // --gas-limit short-circuits gas limit resolution, so the bound has to be
      // checked independently of it. Otherwise an override could store a list
      // that a later default clear could not remove.
      expect(() => resolveEvmFees("setAllowedClaimRecipients", { gasLimit: "8000000" }, 51)).to.throw(
        /At most 50 addresses/
      );
      expect(() => resolveEvmFees("setClaimExecutors", { gasLimit: "8000000" }, 100)).to.throw(/At most 50 addresses/);
    });

    it("still allows --gas-limit to raise gas for a list within the bound", () => {
      // Clearing a long pre-existing list is the case that legitimately needs it.
      expect(resolveEvmFees("setAllowedClaimRecipients", { gasLimit: "2000000" }, 0).gasLimit).to.equal(2_000_000);
      expect(resolveEvmFees("setAllowedClaimRecipients", { gasLimit: "5000000" }, 50).gasLimit).to.equal(5_000_000);
    });

    it("refuses a longer list rather than signing one that cannot be cleared", () => {
      // The floor has to cover clearing whatever is stored, and the stored
      // length is invisible at build time, so the length this tool will write
      // is bounded to keep that guarantee true.
      expect(() => listGasLimit(MAX_LIST_ENTRIES + 1)).to.throw(/At most 50 addresses/);
    });

    it("keeps the floor able to clear a list of the supported maximum", () => {
      // Clearing a stored 50-address list measured 573,340 gas on a mainnet
      // fork, and scales at roughly 11k per entry.
      const CLEAR_GAS_PER_ENTRY = 11_500;
      expect(listGasLimit(0)).to.be.greaterThan(MAX_LIST_ENTRIES * CLEAR_GAS_PER_ENTRY);
    });
  });

  describe("normalizeAddressList", () => {
    const ADDRESS = `0x${"11".repeat(20)}`;

    it("drops blank entries, which is how the CLI expresses remove-all", () => {
      expect(normalizeAddressList([""])).to.deep.equal([]);
      expect(normalizeAddressList(["   "])).to.deep.equal([]);
      expect(normalizeAddressList(undefined)).to.deep.equal([]);
    });

    it("gives a list and the same list plus a blank the same gas limit", () => {
      // A discarded blank must not change the gas limit, or it would change the
      // hash without changing the encoded call.
      const twelve = Array.from({ length: 12 }, () => ADDRESS);
      const withBlank = [...twelve, ""];
      expect(normalizeAddressList(withBlank)).to.deep.equal(twelve);
      expect(listGasLimit(normalizeAddressList(withBlank).length)).to.equal(
        listGasLimit(normalizeAddressList(twelve).length)
      );
    });

    it("is idempotent, so normalizing twice cannot shift the size", () => {
      const once = normalizeAddressList([ADDRESS, "", ADDRESS]);
      expect(normalizeAddressList(once)).to.deep.equal(once);
    });
  });
});
