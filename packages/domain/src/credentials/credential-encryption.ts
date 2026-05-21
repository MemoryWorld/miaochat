import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function createKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptCredentialSecret(secret: string, encryptionKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, createKey(encryptionKey), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64")).join(".");
}

export function decryptCredentialSecret(
  encryptedSecret: string,
  encryptionKey: string
): string {
  const [ivPart, tagPart, bodyPart] = encryptedSecret.split(".");
  if (!ivPart || !tagPart || !bodyPart) {
    throw new Error("Invalid encrypted credential secret");
  }

  const decipher = createDecipheriv(
    algorithm,
    createKey(encryptionKey),
    Buffer.from(ivPart, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(bodyPart, "base64")),
    decipher.final()
  ]).toString("utf8");
}
