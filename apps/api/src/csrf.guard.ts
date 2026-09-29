import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthRequest } from './auth.guard.js';
@Injectable() export class CsrfGuard implements CanActivate { canActivate(c:ExecutionContext){const r=c.switchToHttp().getRequest<AuthRequest>(); const origin=r.headers.origin; const allowed=process.env['PUBLIC_ORIGIN']??'http://localhost:8080'; if(origin&&origin!==allowed)throw new BadRequestException('INVALID_ORIGIN'); if(r.headers['x-csrf-token']!==r.csrf)throw new BadRequestException('CSRF_REJECTED'); return true;} }
