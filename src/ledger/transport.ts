import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";

export type HidTransport = Awaited<ReturnType<typeof TransportNodeHid.open>>;

/** How `bindings` starts its error when node-hid has no binary, followed by every path it tried. */
const MISSING_BINARY = "Could not locate the bindings file";

export const NODE_HID_NOT_BUILT =
  "The Ledger USB module node-hid has no binary: its install script did not run (npm with ignore-scripts=true). " +
  "Run `npm rebuild node-hid --global --ignore-scripts=false`, or see Installation in the README";

/** The connected Ledger's USB transport; tests pass another opener. */
const openDevice = (): Promise<HidTransport> => TransportNodeHid.open(undefined);

/**
 * Opens the USB transport. node-hid loads its binary here; without one (npm skipped its install script) the error
 * lists only the paths it tried, so it is replaced by one that says how to build it, with the original as cause.
 */
export async function openTransport(open: () => Promise<HidTransport> = openDevice): Promise<HidTransport> {
  try {
    return await open();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(MISSING_BINARY)) {
      throw new Error(NODE_HID_NOT_BUILT, { cause: error });
    }
    throw error;
  }
}

/**
 * Opens the USB transport, wraps it in a device app client, runs `use` and
 * returns its result. The transport is closed in every case, also when the
 * client cannot be created.
 */
export async function withApp<App, R>(
  createApp: (transport: HidTransport) => App,
  use: (app: App) => Promise<R>,
  open: () => Promise<HidTransport> = openDevice
): Promise<R> {
  const transport = await openTransport(open);
  try {
    return await use(createApp(transport));
  } finally {
    await transport.close();
  }
}
