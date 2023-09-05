import chalk from 'chalk';
import {
  log,
  logInfo,
  logError,
  logSuccess,
  logWarning
} from '../../src/output'; // Replace with the actual path

describe('Logging Functions', () => {
  // Mock console.log to capture logs
  let originalLog: any;
  let capturedLogs: any;

  beforeAll(() => {
    originalLog = console.log;
    capturedLogs = [];
    console.log = jest.fn((...args) => {
      capturedLogs.push(args.join(' '));
    });
  });

  afterAll(() => {
    console.log = originalLog;
  });

  beforeEach(() => {
    capturedLogs = [];
  });

  test('log should log a message without formatting', () => {
    const message = 'Test log message';
    log(message);
    expect(capturedLogs).toEqual([message]);
  });

  test('logInfo should log a message in blue color', () => {
    const message = 'Test info message';
    logInfo(message);
    expect(capturedLogs).toEqual([chalk.blue(message)]);
  });

  test('logError should log a message in red color', () => {
    const message = 'Test error message';
    logError(message);
    expect(capturedLogs).toEqual([chalk.red(message)]);
  });

  test('logSuccess should log a message in green color', () => {
    const message = 'Test success message';
    logSuccess(message);
    expect(capturedLogs).toEqual([chalk.green(message)]);
  });

  test('logWarning should log a message in yellow color', () => {
    const message = 'Test warning message';
    logWarning(message);
    expect(capturedLogs).toEqual([chalk.yellow(message)]);
  });
});
