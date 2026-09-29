import { CanActivate,ExecutionContext,Inject,Injectable,UnauthorizedException } from '@nestjs/common';
import type { AccountRepository } from '@fluentcoach/application';
import type { Request } from 'express';
import { IDLE_MS,SESSION_STORE,type SessionStore } from './session.js';
import { ACCOUNT_REPOSITORY } from './tokens.js';
export type AuthRequest=Request&{accountId?:string;sessionId?:string;csrf?:string};
@Injectable()
export class AuthGuard implements CanActivate {
 constructor(@Inject(SESSION_STORE)private readonly sessions:SessionStore,@Inject(ACCOUNT_REPOSITORY)private readonly accounts:AccountRepository){}
 async canActivate(c:ExecutionContext){const r=c.switchToHttp().getRequest<AuthRequest>(),id=r.cookies?.fc_session as string|undefined;if(!id)throw new UnauthorizedException('AUTH_REQUIRED');const s=await this.sessions.get(id),now=Date.now();if(!s||s.absoluteExpiresAt<=now||s.lastSeenAt+IDLE_MS<=now){if(s)await this.sessions.delete(id);throw new UnauthorizedException('SESSION_EXPIRED');}if(await this.accounts.findStatus(s.accountId)!=='ACTIVE'){await this.sessions.delete(id);throw new UnauthorizedException('ACCOUNT_REVOKED');}s.lastSeenAt=now;await this.sessions.set(id,s);Object.assign(r,{accountId:s.accountId,sessionId:id,csrf:s.csrf});return true;}
}
