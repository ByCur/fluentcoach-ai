import { randomBytes } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';

export type Session = { accountId: string; csrf: string; authenticatedAt: number; lastSeenAt: number; absoluteExpiresAt: number };
export interface SessionStore { get(id: string): Promise<Session | null>; set(id: string, session: Session): Promise<void>; delete(id: string): Promise<void> }
export class RedisSessionStore implements SessionStore {
  private client: RedisClientType;
  constructor(url: string) { this.client = createClient({ url, socket: {reconnectStrategy:false,connectTimeout:2000} }); this.client.on('error',()=>undefined); }
  private async ready() { if (!this.client.isOpen) await this.client.connect(); }
  async get(id:string) { await this.ready(); const value=await this.client.get(`session:${id}`); return value ? JSON.parse(value) as Session : null; }
  async set(id:string, value:Session) { await this.ready(); await this.client.set(`session:${id}`,JSON.stringify(value),{PX:Math.max(1,value.absoluteExpiresAt-Date.now())}); }
  async delete(id:string) { await this.ready(); await this.client.del(`session:${id}`); }
}
export class MemorySessionStore implements SessionStore {
  readonly sessions=new Map<string,Session>(); get(id:string){return Promise.resolve(this.sessions.get(id)??null);} set(id:string,s:Session){this.sessions.set(id,s);return Promise.resolve();} delete(id:string){this.sessions.delete(id);return Promise.resolve();}
}
export const token = () => randomBytes(32).toString('base64url');
export const SESSION_STORE = Symbol('SESSION_STORE');
export const IDLE_MS=30*60_000, ABSOLUTE_MS=12*60*60_000;
