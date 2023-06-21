import { Command } from 'commander';
import { cli } from './cli';
const program = new Command();
cli(program).then(() => {
    program.parse();
})
