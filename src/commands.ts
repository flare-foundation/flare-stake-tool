import * as fs from 'fs';
const parseCsv = require('csv-parse/lib/sync');



export async function readCsv(dataFile: string) {
  let rawData = fs.readFileSync(dataFile, "utf8");
  const parsed: { nodeId: string, startTime: number, endTime: number, vaultNum: number, amount: string, fileName: string }[] = parseCsv(rawData, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ';',
    skip_records_with_error: false
  }).map(
    (it: any, i: number) => {
      return {
        nodeId: it["node"],
        startTime: it["start"],
        endTime: it["end"],
        vaultNum: it["vault"],
        amount: it["amount"],
        fileName: it["file name"],
      }
    }
  );
  return parsed;
}


export async function getCommands(dataFile: string) {
  let data = await readCsv(dataFile);
  let commands = [];
  for (let obj of data) {
    let c1 = `bin/flare-stake-tool transaction delegate -n ${obj.nodeId} --amount ${obj.amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} --start-time ${obj.startTime} --end-time ${obj.endTime} -i ${obj.fileName} --ctx-file ctx${obj.vaultNum}.json`;
    let c2 = `bin/flare-stake-tool forDefi sign -i ${obj.fileName} --ctx-file ctx${obj.vaultNum}.json`;
    let c3 = `bin/flare-stake-tool forDefi fetch -i ${obj.fileName} --ctx-file ctx${obj.vaultNum}.json`;
    let c4 = `bin/flare-stake-tool send -i ${obj.fileName} --ctx-file ctx${obj.vaultNum}.json`;
    commands.push({
      c1: c1,
      c2: c2
    })
  }
  let generatedJSON = JSON.stringify(commands, null, 2);
  fs.writeFileSync(`generated-commands.json`, generatedJSON, "utf8");

}

getCommands("data.csv")