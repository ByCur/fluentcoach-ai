import { connect } from 'node:net';

export type DependencyProbe = () => Promise<boolean>;

export async function probeTcpUrl(rawUrl: string, timeoutMs = 1_000): Promise<boolean> {
  const url = new URL(rawUrl);
  const defaultPort = url.protocol === 'postgresql:' ? 5432 : 6379;
  const port = url.port === '' ? defaultPort : Number(url.port);
  return await new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port });
    const finish = (result: boolean): void => { socket.destroy(); resolve(result); };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

export async function dependenciesReady(probes: readonly DependencyProbe[]): Promise<boolean> {
  const results = await Promise.all(probes.map(async (probe) => await probe()));
  return results.every(Boolean);
}
