import { PRIVACY_LIMITS } from '@fluentcoach/domain';
import 'reflect-metadata';
import { config as dotenvConfig } from 'dotenv';
// Never inherit a developer .env in test/staging/production. Cloud secrets are injected.
const environment = process.env['APP_ENVIRONMENT'] ?? (process.env['NODE_ENV'] === 'test' ? 'test' : process.env['NODE_ENV'] === 'production' ? 'production' : 'local');
if (environment === 'local') dotenvConfig({path:'.env',quiet:true});
if (environment === 'test') dotenvConfig({path:'.env.test',quiet:true});
import { NestFactory } from '@nestjs/core';
const {loadServerConfig,validateReleaseRuntime}=await import('@fluentcoach/infrastructure');

import { json } from 'express';
const {securityMiddleware}=await import('./security.js');
import cookieParser from 'cookie-parser';
const {ApiExceptionFilter}=await import('./api-exception.filter.js');

validateReleaseRuntime(process.env);
const config = loadServerConfig(process.env);
const { AppModule } = await import('./app.module.js');
const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: false, logger: false });
app.use(securityMiddleware());
app.use(json({limit:PRIVACY_LIMITS.jsonBodyBytes,verify:(req,_res,buffer)=>{(req as import('@nestjs/common').RawBodyRequest<import('express').Request>).rawBody=buffer;}}));
app.use(cookieParser());
app.useGlobalFilters(new ApiExceptionFilter());
app.enableCors({origin:config.PUBLIC_ORIGIN,credentials:true,allowedHeaders:['content-type','x-csrf-token']});
app.enableShutdownHooks();
await app.listen(config.API_PORT, '0.0.0.0');
