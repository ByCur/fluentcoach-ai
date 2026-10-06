export type ConnectionState = 'starting' | 'ready' | 'reconnecting' | 'unavailable';
export async function waitForApi(
  onState: (state: ConnectionState) => void,
  signal: AbortSignal,
  request: typeof fetch = fetch,
  attempts = 16,
  delayMs = 5000,
): Promise<boolean> {
  onState('starting');
  for (let attempt = 0; attempt < attempts && !signal.aborted; attempt++) {
    try {
      const response = await request('/health/ready', {signal:AbortSignal.any([signal,AbortSignal.timeout(5000)]), credentials:'include'});
      if (response.ok && (await response.json() as {status?:string}).status === 'ok') { onState('ready');return true; }
    } catch { /* Cold-start HTML, restart, network outage: do not fabricate readiness. */ }
    if (attempt + 1 < attempts && !signal.aborted) await new Promise<void>(resolve => {
      const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
      const timer=setTimeout(finish,delayMs);signal.addEventListener('abort',finish,{once:true});
    });
  }
  if (!signal.aborted) onState('unavailable');
  return false;
}
