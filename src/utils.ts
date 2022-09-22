import { bech32 } from 'bech32';
import * as sha256 from "fast-sha256";
import { BinTools, Buffer } from 'avalanche'
import converter from "bech32-converting"

export async function sleepms(milliseconds: number) {
    await new Promise((resolve: any) => {
      setTimeout(() => {
        resolve();
      }, milliseconds);
    });
  }

export function unPrefix0x(tx: string) {
    if (!tx) {
       return "0x0";
    }
    return tx.startsWith("0x") ? tx.slice(2) : tx;
  }

const addressSep = '-';
const ripemd160Size = 20;

function parse(addrStr: string): { chainID: string, hrp: string, addr: number[] } {
	const addressParts: string[] = addrStr.split(addressSep);
    if (addressParts.length < 2) {
        throw new Error('no separator found in address');
    }
	const chainID = addressParts[0];
	const rawAddr = addressParts[1];

	const { hrp, addr } = parseBech32(rawAddr)
	return { chainID, hrp, addr };
}

function parseBech32(addrStr: string): { hrp: string, addr: number[] } {
    const decodeRes = bech32.decode(addrStr);
    if (!decodeRes) throw new Error('error decoding');
    const addrBytes = bech32.fromWords(decodeRes.words);
    return { hrp: decodeRes.prefix, addr: addrBytes };
}

function toShortId(addrBytes: number[]): number[] {
    if (addrBytes.length !== ripemd160Size) throw new Error(`expected ${ripemd160Size} bytes but got ${addrBytes.length}`);
    return addrBytes;
}

function parseToIDBuffer(addrStr: string): number[] {
    const { addr } = parse(addrStr);
    return toShortId(addr);
}

/**
 * Converts bech32 address to associated secp256k1 public key
 * @param addrStr - address in bech32 format
 * @returns secp256k1 public key
 */
export function parseToID(addrStr: string): string {
    const bintools = BinTools.getInstance()
    const bufferID = Buffer.from(parseToIDBuffer(addrStr))
    return bintools.cb58Encode(bufferID)
}

/**
 * Produces the configuration hash, encoding the validator configuration required by network nodes
 * @param networkID - id of the network (e.g. for localflare it is "162")
 * @param pChainPublicKey - secp256k1 public key (e.g."6Y3kysjF9jnHnYkdS9yGAuoHyae2eNmeV")
 * @param nodeID - id of the node associated with the validator 
 * (e.g. "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ" = parseToID("P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v"))
 * @param weight - staking amount (e.g. "10000000000000")
 * @param duration - duration of the validation process in seconds (e.g. "1512000")
 * @returns Hash generated via sha-256 function
 */
export function toValidatorConfigHash(networkID: string, pChainPublicKey: string, nodeID: string, weight: string, duration: string) {
    let enc = new TextEncoder(); // always utf-8

    let salt = "flare" + networkID + "-"
    let pChainPublicKeyHash = sha256.hash(enc.encode(salt + pChainPublicKey))
    let nodeIDHash = sha256.hash(enc.encode(salt + nodeID))
    let nodeWeightHash = sha256.hash(enc.encode(salt + weight))
    let nodeDurationHash = sha256.hash(enc.encode(salt + duration))

    let validatorConfig = new Uint8Array(pChainPublicKeyHash.length + nodeIDHash.length + nodeWeightHash.length + nodeDurationHash.length)
    validatorConfig.set(pChainPublicKeyHash)
    validatorConfig.set(nodeIDHash, pChainPublicKeyHash.length)
    validatorConfig.set(nodeWeightHash, pChainPublicKeyHash.length + nodeIDHash.length)
    validatorConfig.set(nodeDurationHash, pChainPublicKeyHash.length + nodeIDHash.length + nodeWeightHash.length)
    let validatorConfigHash = sha256.hash(validatorConfig)

	return Buffer.from(validatorConfigHash).toString('hex')
}

/**
 * This function converts the bech32 format to hexadecimal.
 * This is useful when trying to derive the C-chain address.
 * @param hrp - human readable part (e.g. localflare)
 * @param bech32addr - full bech32 address (e.g. P-localflare1pynhfl09rfrf20s83lf6ra5egqylmx75dmpf9s)
 * @returns The bech32 address converted to hexadecimal
 */
export function fromBech32ToHex(hrp: string, bech32addr: string): string {
  return converter(hrp).toHex(bech32addr.split('-')[1])
}

/**
 * This function converts the hexadecimal address to bech32.
 * It is useful when trying to derive P-chain address from C-chain address 
 * that is usually expressed in hexadecimal.
 * @param hrp - human readable part (e.g. localflare)
 * @param hexaddr - hex address (e.g. 0x092774fde51a46953e078fd3a1f6994009fd9bd4)
 * @returns The hexadecimal address converted to bech32 format
 */
export function fromHexToBech32(hrp: string, hexaddr: string): string {
  return converter(hrp).toBech32(unPrefix0x(hexaddr))
}