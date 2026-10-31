import type { Account } from "../chain/keys";
import { saveUnsignedTxJson, unsignedTxJsonFromBundle } from "../core/files";
import {
  FILE_SIGNER_POLICY,
  type BuildPolicy,
  type SignResult,
  type Signer,
  type UnsignedTxBundle,
} from "../core/types";

/**
 * The external-signature flow (ForDefi and manual signing): builds with the
 * deterministic policy, writes the unsigned file and stops. `send -i` finishes
 * the job once a signature file exists.
 */
export class ExternalFileSigner implements Signer {
  readonly kind = "file" as const;
  readonly policy: BuildPolicy = FILE_SIGNER_POLICY;

  constructor(
    private readonly knownAccount: Account,
    private readonly id: string,
    private readonly cwd: string = process.cwd()
  ) {}

  account(): Promise<Account> {
    return Promise.resolve(this.knownAccount);
  }

  sign(bundle: UnsignedTxBundle): Promise<SignResult> {
    const { file, forDefiHash } = saveUnsignedTxJson(unsignedTxJsonFromBundle(bundle), this.id, this.cwd);
    return Promise.resolve({ status: "pending", id: this.id, forDefiHash, file });
  }
}
