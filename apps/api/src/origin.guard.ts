import { BadRequestException,CanActivate,ExecutionContext,Injectable } from '@nestjs/common';
import type { Request } from 'express';
@Injectable() export class OriginGuard implements CanActivate { canActivate(c:ExecutionContext){const r=c.switchToHttp().getRequest<Request>(),origin=r.headers.origin,allowed=process.env['PUBLIC_ORIGIN']??'http://localhost:8080';if(origin!==allowed)throw new BadRequestException('INVALID_ORIGIN');return true;} }
