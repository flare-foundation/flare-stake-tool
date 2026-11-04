// Kept as a thin re-export so existing integration tests keep their imports.
export { runCli, makeTempDir, cleanupTempDir, type CliResult } from "../helpers/cli";
export {
  EWOQ_PRIVATE_KEY_HEX,
  EWOQ_PRIVATE_KEY_CB58,
  EWOQ_ETH_ADDRESS,
  EWOQ_PUBLIC_KEY_COMPRESSED,
  EWOQ_P_ADDRESS,
  signMessageHash,
} from "../helpers/keys";
import { writeEnvFile } from "../helpers/cli";
import { EWOQ_PRIVATE_KEY_CB58, EWOQ_PRIVATE_KEY_HEX } from "../helpers/keys";

export function writeTestEnv(dir: string): string {
  return writeEnvFile(dir, EWOQ_PRIVATE_KEY_HEX, EWOQ_PRIVATE_KEY_CB58);
}
