import { Injectable } from "@nestjs/common";
import pino, { type Logger as PinoLogger } from "pino";

export type LogLevel = "debug" | "error" | "info" | "warn";

export type LogFields = Record<string, unknown>;

const redactedPaths = [
  "authorization",
  "cookie",
  "cookies",
  "headers.authorization",
  "headers.cookie",
  "headers.set-cookie",
  "password",
  "providerSecret",
  "rawSecret",
  "secret",
  "sessionToken",
  "token"
] as const;

@Injectable()
export class StructuredLogger {
  private readonly logger: PinoLogger;
  private stream: NodeJS.WritableStream;

  constructor(options: {
    logger?: PinoLogger;
    minLevel?: LogLevel;
    serviceName?: string;
    stream?: NodeJS.WritableStream;
  } = {}) {
    this.stream = options.stream ?? process.stdout;
    this.logger =
      options.logger ??
      pino(
        {
          base: {
            service: options.serviceName ?? process.env.SERVICE_NAME ?? "api"
          },
          formatters: {
            level: (label) => ({
              level: label
            })
          },
          level: options.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? "info",
          messageKey: "event",
          redact: {
            censor: "[Redacted]",
            paths: [...redactedPaths]
          },
          serializers: {
            err: pino.stdSerializers.err,
            error: pino.stdSerializers.err
          },
          timestamp: () => `,"ts":"${new Date().toISOString()}"`
        },
        {
          write: (chunk: string) => {
            this.stream.write(chunk);
          }
        }
      );
  }

  info(event: string, fields: LogFields = {}): void {
    this.emit("info", event, fields);
  }

  warn(event: string, fields: LogFields = {}): void {
    this.emit("warn", event, fields);
  }

  error(event: string, fields: LogFields = {}): void {
    this.emit("error", event, fields);
  }

  debug(event: string, fields: LogFields = {}): void {
    this.emit("debug", event, fields);
  }

  child(extraFields: LogFields): StructuredLogger {
    return new StructuredLogger({
      logger: this.logger.child(extraFields)
    });
  }

  protected emit(level: LogLevel, event: string, fields: LogFields): void {
    switch (level) {
      case "debug":
        this.logger.debug(fields, event);
        return;
      case "info":
        this.logger.info(fields, event);
        return;
      case "warn":
        this.logger.warn(fields, event);
        return;
      case "error":
        this.logger.error(fields, event);
        return;
    }
  }
}
