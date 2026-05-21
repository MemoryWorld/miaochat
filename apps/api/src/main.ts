import "reflect-metadata";

import { fileURLToPath } from "node:url";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false
    })
  );

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen({
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 3001)
  });
}

if (process.env.NODE_ENV !== "test") {
  const entryFile = process.argv[1];
  const isMainModule =
    typeof entryFile === "string" && fileURLToPath(import.meta.url) === entryFile;

  if (isMainModule) {
    bootstrap().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
