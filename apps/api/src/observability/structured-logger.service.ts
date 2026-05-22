import { Injectable } from "@nestjs/common";

export type LogLevel = "debug" | "error" | "info" | "warn";

export type LogFields = Record<string, unknown>;

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

@Injectable()
export class StructuredLogger {
  private readonly stream: NodeJS.WritableStream;
  private readonly minLevel: LogLevel;
  private readonly serviceName: string;

  constructor(options: {
    minLevel?: LogLevel;
    serviceName?: string;
    stream?: NodeJS.WritableStream;
  } = {}) {
    this.serviceName = options.serviceName ?? process.env.SERVICE_NAME ?? "api";
    this.minLevel = options.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
    this.stream = options.stream ?? process.stdout;
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
    const parent = this;
    return Object.assign(
      new StructuredLogger({
        minLevel: this.minLevel,
        serviceName: this.serviceName,
        stream: this.stream
      }),
      {
        emit(level: LogLevel, event: string, fields: LogFields) {
          parent.emit(level, event, { ...extraFields, ...fields });
        }
      } as Partial<StructuredLogger>
    );
  }

  protected emit(level: LogLevel, event: string, fields: LogFields): void {
    if (levelOrder[level] < levelOrder[this.minLevel]) {
      return;
    }

    const record = {
      event,
      level,
      service: this.serviceName,
      ts: new Date().toISOString(),
      ...fields
    };

    this.stream.write(`${JSON.stringify(record)}\n`);
  }
}
