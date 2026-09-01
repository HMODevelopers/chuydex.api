import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpErrorFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });
  const origins = (process.env.CORS_ORIGIN ?? "*")
    .split(",")
    .map((origin) => origin.trim());
  app.enableCors({
    origin: origins.includes("*") ? "*" : origins,
    credentials: !origins.includes("*"),
  });
  app.use(helmet());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("ChuyDex API")
      .setDescription("Administración de snacks de oficina")
      .setVersion("1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("api/docs", app, doc);
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
