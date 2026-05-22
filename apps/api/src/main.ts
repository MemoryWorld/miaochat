import "reflect-metadata";

import { fileURLToPath } from "node:url";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { bindUnhandledErrorMonitors } from "@agenthub/observability-errors";

import { AppModule } from "./app.module.js";
import { ErrorReporterService } from "./observability/error-reporter.service.js";

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
  const reporter = app.get(ErrorReporterService);
  bindUnhandledErrorMonitors((error, context) => {
    void reporter.captureUnhandled(error, {
      runtime: "api",
      ...context
    });
  });

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
