import path from "node:path";
import { Readable } from "node:stream";

import AdmZip from "adm-zip";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { PreparedDeployRecord } from "./deploy-types.js";

export type DeployFile = {
  contentType?: string;
  data: Buffer;
  path: string;
};

export type DeployArtifactBundle = {
  files: DeployFile[];
  source: "fallback" | "json-manifest" | "object" | "zip";
};

type ExtractOptions = {
  artifactTitle: string;
  fallbackFileName: string;
  storageKey: string;
};

type DeployManifest = {
  files?: Array<{
    content?: string;
    contentBase64?: string;
    contentType?: string;
    path?: string;
  }>;
};

const maxDeployFileCount = 100;
const maxDeployFileBytes = 5 * 1024 * 1024;
const maxDeployBundleBytes = 25 * 1024 * 1024;

export async function loadDeployArtifactBundle(
  input: PreparedDeployRecord
): Promise<DeployArtifactBundle> {
  if (!input.artifactStorageKey) {
    return {
      files: [createFallbackIndexFile(input.artifactTitle)],
      source: "fallback"
    };
  }

  const body = await readDeployArtifactObject(input.artifactStorageKey);

  return {
    files: extractDeployFilesFromBuffer(body, {
      artifactTitle: input.artifactTitle,
      fallbackFileName: fallbackFileNameForStorageKey(input.artifactStorageKey),
      storageKey: input.artifactStorageKey
    }),
    source: isZipBuffer(body)
      ? "zip"
      : isJsonManifestKey(input.artifactStorageKey)
        ? "json-manifest"
        : "object"
  };
}

export function extractDeployFilesFromBuffer(
  buffer: Buffer,
  options: ExtractOptions
): DeployFile[] {
  assertBundleSize(buffer.length);

  if (isZipBuffer(buffer)) {
    return extractZipFiles(buffer);
  }

  if (isJsonManifestKey(options.storageKey)) {
    return extractManifestFiles(buffer);
  }

  const path = safeDeployPath(options.fallbackFileName);
  return [
    {
      contentType: inferContentType(path),
      data: buffer,
      path
    }
  ];
}

export function selectContainerIndexHtml(
  files: DeployFile[],
  artifactTitle: string
): string {
  const explicitIndex = files.find((file) => file.path === "index.html");
  if (explicitIndex) {
    return explicitIndex.data.toString("utf8");
  }

  const firstHtml = files.find((file) => file.path.endsWith(".html"));
  if (firstHtml) {
    return firstHtml.data.toString("utf8");
  }

  const fileList = files.map((file) => `<li>${escapeHtml(file.path)}</li>`).join("");

  return [
    "<!doctype html>",
    "<html>",
    "<head><meta charset=\"utf-8\"><title>Miaochat Container Deploy</title></head>",
    "<body>",
    `<h1>${escapeHtml(artifactTitle)}</h1>`,
    "<p>This container preview was generated from a Miaochat deploy artifact.</p>",
    `<ul>${fileList}</ul>`,
    "</body>",
    "</html>"
  ].join("");
}

function extractZipFiles(buffer: Buffer): DeployFile[] {
  const zip = new AdmZip(buffer);
  const files: DeployFile[] = [];
  let totalBytes = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const entryPath = safeDeployPath(entry.entryName);
    const data = entry.getData();
    assertFileSize(entryPath, data.length);
    totalBytes += data.length;
    assertBundleSize(totalBytes);
    files.push({
      contentType: inferContentType(entryPath),
      data,
      path: entryPath
    });
  }

  if (files.length === 0) {
    throw new Error("Deploy zip artifact does not contain any files.");
  }

  if (files.length > maxDeployFileCount) {
    throw new Error(`Deploy artifact has too many files (${files.length}).`);
  }

  return sortDeployFiles(files);
}

function extractManifestFiles(buffer: Buffer): DeployFile[] {
  const manifest = JSON.parse(buffer.toString("utf8")) as DeployManifest;
  const entries = manifest.files ?? [];

  if (entries.length === 0) {
    throw new Error("Deploy manifest does not contain any files.");
  }

  if (entries.length > maxDeployFileCount) {
    throw new Error(`Deploy manifest has too many files (${entries.length}).`);
  }

  let totalBytes = 0;
  return sortDeployFiles(entries.map((entry) => {
    const filePath = safeDeployPath(entry.path ?? "");
    const data =
      typeof entry.contentBase64 === "string"
        ? Buffer.from(entry.contentBase64, "base64")
        : Buffer.from(entry.content ?? "", "utf8");
    assertFileSize(filePath, data.length);
    totalBytes += data.length;
    assertBundleSize(totalBytes);

    return {
      contentType: entry.contentType ?? inferContentType(filePath),
      data,
      path: filePath
    };
  }));
}

function sortDeployFiles(files: DeployFile[]): DeployFile[] {
  return [...files].sort((left, right) => {
    if (left.path === "index.html") {
      return -1;
    }
    if (right.path === "index.html") {
      return 1;
    }
    return left.path.localeCompare(right.path);
  });
}

export async function readDeployArtifactObject(storageKey: string): Promise<Buffer> {
  const client = createDeployS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET ?? "agenthub-dev",
      Key: storageKey
    })
  );

  if (!response.Body) {
    throw new Error(`Artifact object ${storageKey} has no response body.`);
  }

  return streamToBuffer(response.Body);
}

export function createDeployS3Client(): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin"
    },
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    forcePathStyle: true,
    region: process.env.S3_REGION ?? "us-east-1"
  });
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    return Buffer.from(await body.transformToByteArray());
  }

  throw new Error("Unsupported artifact object body type.");
}

function safeDeployPath(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));

  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    throw new Error(`Unsafe path in deploy artifact: ${value}`);
  }

  return normalized;
}

function fallbackFileNameForStorageKey(storageKey: string): string {
  const baseName = path.posix.basename(storageKey);
  if (!baseName || baseName === "." || baseName === "/") {
    return "artifact.html";
  }

  return baseName.endsWith(".zip") ? "index.html" : baseName;
}

function createFallbackIndexFile(artifactTitle: string): DeployFile {
  return {
    contentType: "text/html",
    data: Buffer.from(selectContainerIndexHtml([], artifactTitle), "utf8"),
    path: "index.html"
  };
}

function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isJsonManifestKey(storageKey: string): boolean {
  return storageKey.endsWith(".deploy.json") || storageKey.endsWith(".deploy-manifest.json");
}

function assertFileSize(filePath: string, size: number): void {
  if (size > maxDeployFileBytes) {
    throw new Error(`Deploy artifact file ${filePath} exceeds the 5MB limit.`);
  }
}

function assertBundleSize(size: number): void {
  if (size > maxDeployBundleBytes) {
    throw new Error("Deploy artifact exceeds the 25MB bundle limit.");
  }
}

function inferContentType(filePath: string): string {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
