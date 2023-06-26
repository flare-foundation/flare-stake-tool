const { UnsignedTx: UnsignedTxEvm, ExportTx } = require("@flarenetwork/flarejs/dist/apis/evm");
const { UnsignedTx: UnsignedTxPlatform } = require("@flarenetwork/flarejs/dist/apis/platformvm");
const { createHash } = require("crypto");
const { readFileSync } = require("fs");

function readBuffer(fileName: string) {
  const fileContent = readFileSync(fileName);
  const fileData = JSON.parse(fileContent.toString());
  return Buffer.from(fileData.unsignedTransactionBuffer, "hex");
}

function debugTx(buffer: Buffer) {
  try {
    const evmTx = new UnsignedTxEvm();
    const numReadEvm = evmTx.fromBuffer(buffer);
    if (numReadEvm === buffer.length) {
      console.log(JSON.stringify(evmTx.serialize("display"), null, 2));
      return;
    }
  } catch {
    // Ignored
  }

  try {
    const platformTx = new UnsignedTxPlatform();
    const numReadPlatform = platformTx.fromBuffer(buffer);
    if (numReadPlatform === buffer.length) {
      console.log(JSON.stringify(platformTx.serialize("display"), null, 2));
      return;
    }
  } catch {
    // Ignored
  }

  console.error("Aborting: Failed to parse transaction");
  process.exit(1);
}

function debugHash(buffer: Buffer) {
  const msg = Buffer.from(createHash("sha256").update(buffer).digest())
  console.log(msg.toString("base64"));
  console.log(msg.toString('hex'))
}

function main() {
  const fileName = process.argv[2];
  if (!fileName) {
    console.error("Aborting: File name is missing");
    process.exit(1);
    return;
  }

  const buffer = readBuffer(fileName);
  debugTx(buffer);
  debugHash(buffer);
}

main();