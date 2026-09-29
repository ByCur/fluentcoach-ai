import { Body,Controller,Get,HttpCode,Inject,Post,Query,Redirect,Req,Res,UnauthorizedException,UseGuards } from '@nestjs/common';
import type { AccountRepository,OidcProvider } from '@fluentcoach/application';
import type { Request,Response } from 'express';
import { AuthGuard,type AuthRequest } from './auth.guard.js';
import { ABSOLUTE_MS,SESSION_STORE,token,type SessionStore } from './session.js';
import { CsrfGuard } from './csrf.guard.js';
import { OriginGuard } from './origin.guard.js';
import { ACCOUNT_REPOSITORY } from './tokens.js';
export const OIDC_PROVIDER=Symbol('OIDC_PROVIDER');
@Controller('api/v1') export class IdentityController {
 constructor(@Inject(SESSION_STORE)private readonly sessions:SessionStore,@Inject(ACCOUNT_REPOSITORY)private readonly accounts:AccountRepository,@Inject(OIDC_PROVIDER)private readonly oidc:OidcProvider){}
 private async establish(accountId:string,req:Request,res:Response){const old=req.cookies?.fc_session as string|undefined;if(old)await this.sessions.delete(old);const id=token(),csrf=token(),now=Date.now();await this.sessions.set(id,{accountId,csrf,authenticatedAt:now,lastSeenAt:now,absoluteExpiresAt:now+ABSOLUTE_MS});res.cookie('fc_session',id,{httpOnly:true,secure:process.env['NODE_ENV']==='production',sameSite:'lax',path:'/',maxAge:ABSOLUTE_MS});return csrf;}
 @Post('auth/synthetic-login') @UseGuards(OriginGuard) async synthetic(@Body()b:{subject?:string},@Req()req:Request,@Res({passthrough:true})res:Response){if(process.env['NODE_ENV']==='production')throw new UnauthorizedException('SYNTHETIC_AUTH_DISABLED');const account=await this.accounts.findOrCreateByIdentity('https://synthetic.invalid/',b.subject??'learner-one');return{csrfToken:await this.establish(account.id,req,res)};}
 @Get('auth/login') @Redirect() async login(){const result=await this.oidc.begin();return{url:result.authorizationUrl};}
 @Get('auth/callback') @Redirect() async callback(@Query('code')code:string,@Query('state')state:string,@Req()req:Request,@Res({passthrough:true})res:Response){const identity=await this.oidc.callback({code,state});const account=await this.accounts.findOrCreateByIdentity(identity.issuer,identity.subject);await this.establish(account.id,req,res);return{url:process.env['PUBLIC_ORIGIN']??'/'};}
 @UseGuards(AuthGuard) @Get('auth/csrf') csrf(@Req()r:AuthRequest){return{csrfToken:r.csrf};}
 @UseGuards(AuthGuard) @Get('me') me(@Req()r:AuthRequest){return this.accounts.getMe(r.accountId!);}
 @UseGuards(AuthGuard,CsrfGuard) @Post('auth/logout') @HttpCode(204) async logout(@Req()r:AuthRequest,@Res({passthrough:true})res:Response){await this.sessions.delete(r.sessionId!);res.clearCookie('fc_session',{path:'/'});}
}
