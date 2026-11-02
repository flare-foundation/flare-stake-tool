import TransportNodeHid from "@ledgerhq/hw-transport-node-hid";

export type HidTransport = Awaited<ReturnType<typeof TransportNodeHid.open>>;

/**
 * Opens the USB transport, wraps it in a device app client, runs `use` and
 * returns its result. The transport is closed in every case, also when the
 * client cannot be created.
 */
export async function withApp<App, R>(
  createApp: (transport: HidTransport) => App,
  use: (app: App) => Promise<R>
): Promise<R> {
  const transport = await TransportNodeHid.open(undefined);
  try {
    return await use(createApp(transport));
  } finally {
    await transport.close();
  }
}
