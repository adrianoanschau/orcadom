import './load-env.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Orcadom API')
    .setDescription('API do controle financeiro doméstico')
    .setVersion('0.1.0')
    .addCookieAuth('accessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document), {
    swaggerOptions: { withCredentials: true },
  });

  await app.listen(process.env.PORT ?? 8080);
}

void bootstrap();
