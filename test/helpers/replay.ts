/**
 * An offline Env for unit tests: a replay server answering from one recorded
 * characterization session (test/fixtures/rpc), and an Env pointed at it.
 */
import { createEnv } from "../../src/app/env";
import { localflareNetworkIdStub } from "../characterization/node-stubs";
import { RpcReplayServer, type Stub } from "../characterization/rpc-replay";
import { fixturePath } from "../characterization/scenarios";

export type ReplayEnv = ReturnType<typeof createEnv>;

export interface Replay {
  env: ReplayEnv;
  /** Stops the Env's provider and the replay server. */
  close(): Promise<void>;
}

/**
 * Starts a replay of a recorded scenario; the caller closes it. `stubs` answer calls the scenario's command does not
 * make, so they are not in its recording (the golden test fails on recorded calls a command no longer makes).
 */
export async function startReplay(scenario: string, stubs: Stub[] = []): Promise<Replay> {
  const server = await RpcReplayServer.start({
    mode: "replay",
    fixturePath: fixturePath(scenario),
    stubs: [localflareNetworkIdStub, ...stubs],
  });
  try {
    const env = createEnv("localflare", { apiUrl: server.url });
    return {
      env,
      close: async () => {
        try {
          env.clients.provider.destroy();
        } finally {
          await server.close();
        }
      },
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

/** Runs `run` against a replay of a recorded scenario, and closes it afterwards. */
export async function withReplay<T>(
  scenario: string,
  run: (env: ReplayEnv) => Promise<T>,
  stubs: Stub[] = []
): Promise<T> {
  const replay = await startReplay(scenario, stubs);
  try {
    return await run(replay.env);
  } finally {
    await replay.close();
  }
}
