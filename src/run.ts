import { Command } from 'commander';
import { cli } from './cli';
import { logError } from './output';

const program = new Command();

cli(program).then(() => {
    program.parseAsync().catch(err => {
        if (err instanceof Error) {
            logError(`Error: ${err.message}`);
        }
    })
})
