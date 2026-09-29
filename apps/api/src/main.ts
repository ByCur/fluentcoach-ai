import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { loadServerConfig } from '@fluentcoach/infrastructure';
import { AppModule } from './app.module.js';

const config = loadServerConfig(process.env);
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
app.enableShutdownHooks();
await app.listen(config.API_PORT, '0.0.0.0');
