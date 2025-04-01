import { TransactionFactory } from "@ethereumjs/tx";
import * as settings from "../settings";
import * as utils from "../utils";
import * as chain from "./chain";
import { bech32 } from "bech32";
import { ec } from "elliptic";
import * as ethutil from "ethereumjs-util";
import { SignedTx } from "../../../flarejs/dist/es/serializable/avax";

const secp256k1 = new ec("secp256k1");

export function compressedPublicKey(publicKey: string): string {
  return _getKeyPair(publicKey).getPublic(true, "hex");
}

export function uncompressedPublicKey(
  publicKey: string,
  prefix: boolean,
): string {
  return _getKeyPair(publicKey)
    .getPublic(false, "hex")
    .slice(prefix ? 0 : 2);
}

export function normalizePublicKey(publicKey: string): string {
  return uncompressedPublicKey(publicKey, false);
}

export function equalPublicKey(value1: string, value2: string): boolean {
  try {
    return normalizePublicKey(value1) === normalizePublicKey(value2);
  } catch {
    return false;
  }
}

export function isPublicKey(value: string): boolean {
  try {
    _getKeyPair(value);
    return true;
  } catch {
    return false;
  }
}

export function publicKeyToCAddress(publicKey: string) {
  let uncompressed = utils.toBuffer(uncompressedPublicKey(publicKey, false));
  return normalizeCAddress(utils.toHex(ethutil.publicToAddress(uncompressed)));
}

export async function cAddressToPublicKey(
  network: string,
  cAddress: string,
): Promise<string | undefined> {
  let publicKey = await _cAddressToPublicKey(network, cAddress);
  if (publicKey) {
    return publicKey;
  } else {
    let pAddress = await chain.getMirroredPAddress(network, cAddress);
    if (pAddress) {
      return _pAddressToPublicKey(network, pAddress);
    } else {
      return undefined;
    }
  }
}

async function _cAddressToPublicKey(
  network: string,
  cAddress: string,
): Promise<string | undefined> {
  let publicKey = undefined;
  try {
    let ctx = await chain.getAnyCTx(network, cAddress);
    if (ctx) {
      publicKey = await recoverPublicKeyFromCTx(ctx);
      if (!equalCAddress(publicKeyToCAddress(publicKey), cAddress)) {
        publicKey = undefined;
      }
    }
  } finally {
    return publicKey;
  }
}

export function isCAddress(value: string): boolean {
  return ethutil.isValidAddress(value);
}

export function equalCAddress(value1: string, value2: string): boolean {
  return utils.isEqualHex(value1, value2) && isCAddress(value1);
}

export function normalizeCAddress(cAddress: string): string {
  return ethutil.toChecksumAddress(cAddress);
}

export function publicKeyToPAddress(
  network: string,
  publicKey: string,
): string {
  let compressed = utils.toBuffer(compressedPublicKey(publicKey));
  let address = ethutil.ripemd160(ethutil.sha256(compressed), false);
  let hrp = settings.HRP[network];
  return normalizePAddress(
    network,
    bech32.encode(hrp, bech32.toWords(address)),
  );
}

export async function pAddressToPublicKey(
  network: string,
  pAddress: string,
): Promise<string | undefined> {
  let normalizedPAddress = normalizePAddress(network, pAddress);
  let publicKey = await _pAddressToPublicKey(network, normalizedPAddress);
  if (publicKey) {
    return publicKey;
  } else {
    let cAddress = await chain.getMirroredCAddress(network, normalizedPAddress);
    if (cAddress) {
      return _cAddressToPublicKey(network, cAddress);
    } else {
      return undefined;
    }
  }
}

async function _pAddressToPublicKey(
  network: string,
  pAddress: string,
): Promise<string | undefined> {
  let publicKey = undefined;
  try {
    let ptx = await chain.getAnyPTx(network, pAddress);
    if (ptx) {
      publicKey = ""; //recoverPublicKeyFromPTx(ptx);
      if (
        !equalPAddress(
          network,
          publicKeyToPAddress(network, publicKey),
          pAddress,
        )
      ) {
        publicKey = undefined;
      }
    }
  } finally {
    return publicKey;
  }
}

export function isPAddress(network: string, value: string): boolean {
  return (value.startsWith("P-") ? value.slice(2) : value).startsWith(
    settings.HRP[network],
  );
}

export function equalPAddress(
  network: string,
  value1: string,
  value2: string,
): boolean {
  let value1Hex = utils.isHex(value1) ? value1 : pAddressToHex(value1);
  let value2Hex = utils.isHex(value2) ? value2 : pAddressToHex(value2);
  return (
    utils.isEqualHex(value1Hex, value2Hex) &&
    isPAddress(network, pAddressToBech(network, value1Hex))
  );
}

export function pAddressToHex(pAddressBech: string): string {
  return utils.toHex(bech32.fromWords(bech32.decode(pAddressBech).words));
}

export function pAddressToBech(network: string, pAddressHex: string): string {
  let hrp = settings.HRP[network];
  return bech32.encode(hrp, bech32.toWords(utils.toBuffer(pAddressHex)));
}

export function normalizePAddress(network: string, pAddress: string): string {
  if (pAddress.startsWith("P-") || pAddress.startsWith("C-")) {
    pAddress = pAddress.slice(2);
  }
  if (utils.isHex(pAddress)) {
    pAddress = pAddressToBech(network, pAddress);
  }
  return pAddress;
}

export async function recoverPublicKeyFromCTx(txData: any): Promise<string> {
  // let tx = TransactionFactory.fromTxData(txData)
  let tx = await TransactionFactory.fromRPC(txData);
  return normalizePublicKey(utils.toHex(tx.getSenderPublicKey(), false));
}

export function recoverPublicKeyFromPTx(txData: SignedTx): string {
  // unsignedTx.fromBuffer(utils.toBuffer(utils.toHex(txData.rawTx, false)) as any)
  // let sigreq = unsignedTx.prepareUnsignedHashes(undefined as any)
  // let msg = utils.toBuffer(utils.toHex(sigreq[0].message, false))
  // let sig = utils.toBuffer(utils.toHex(txData.credentials[0].signatures[0], false))
  // let kp = chain.getAvalanche(txData.network).PChain().keyChain().makeKey()
  // return normalizePublicKey(utils.toHex(kp.recover(msg as any, sig as any)))
  return "";
}

export function recoverPublicKeyFromMsg(
  message: string,
  signature: string,
): string {
  let msg = utils.toBuffer(message);
  let sig = ethutil.fromRpcSig(utils.toHex(signature));
  return normalizePublicKey(
    utils.toHex(ethutil.ecrecover(msg, sig.v, sig.r, sig.s)),
  );
}

export function recoverPublicKeyFromEthMsg(
  message: string,
  signature: string,
): string {
  let hashedMsg = getHashedEthMsg(message);
  return recoverPublicKeyFromMsg(hashedMsg, signature);
}

export function getHashedEthMsg(message: string): string {
  return utils.toHex(
    ethutil.keccakFromString(
      `\x19Ethereum Signed Message:\n${message.length}${message}`,
    ),
  );
}

export function getEthSignatureComponents(
  signature: string,
): [string, string, string] {
  let sig = ethutil.fromRpcSig(utils.toHex(signature));
  return [
    utils.toHex(sig.v.toString(16)),
    utils.toHex(sig.r),
    utils.toHex(sig.s),
  ];
}

function _getKeyPair(publicKey: string): ec.KeyPair {
  publicKey = utils.toHex(publicKey, false);
  if (publicKey.length == 128) {
    publicKey = "04" + publicKey;
  }
  return secp256k1.keyFromPublic(publicKey, "hex");
}

export function compressPublicKey(publicKey: Uint8Array): Uint8Array {
  // Check if the public key is already compressed
  if (publicKey.length === 33) {
    return publicKey;
  }

  // Get the x coordinate
  const x = publicKey.slice(1, 33);

  // Get the y coordinate
  const y = publicKey.slice(33, 65);

  // Determine the parity of the y coordinate
  const prefix = y[y.length - 1] % 2 === 0 ? 0x02 : 0x03;

  // Return the compressed public key
  return Buffer.concat([Buffer.from([prefix]), x]);
}
