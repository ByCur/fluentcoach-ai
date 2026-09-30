import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { loadServerConfig } from '@fluentcoach/infrastructure';
import { AppModule } from './app.module.js';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './api-exception.filter.js';

const config = loadServerConfig(process.env);
const app = await NestFactory.create(AppModule, { rawBody: true, logger: ['error', 'warn', 'log'] });
app.use(cookieParser());
app.useGlobalFilters(new ApiExceptionFilter());
app.enableCors({origin:config.PUBLIC_ORIGIN,credentials:true,allowedHeaders:['content-type','x-csrf-token']});
app.enableShutdownHooks();
await app.listen(config.API_PORT, '0.0.0.0');
