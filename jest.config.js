/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
  coveragePathIgnorePatterns: ['./src/cli.ts', './src/ledger/*',  './test/helper']
};
