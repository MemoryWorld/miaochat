import { Injectable } from "@nestjs/common";

export type ScanResult = {
  reason?: string;
  status: "clean" | "rejected" | "pending";
};

const REJECT_PATTERNS: readonly RegExp[] = [
  /eicar/i,
  /\.exe(\?|$)/i,
  /\.scr(\?|$)/i,
  /\.bat(\?|$)/i
];

const LARGE_PAYLOAD_THRESHOLD = 10 * 1024 * 1024; // 10 MiB

/**
 * Stub virus / content scan that gates inline rendering until a real scanner
 * lands. The implementation is intentionally cheap: it short-circuits known
 * binary-like file names and otherwise considers a payload "clean" once it is
 * smaller than the inline-render threshold. Larger or unscanned attachments
 * fall back to a download link surfaced by the client.
 */
@Injectable()
export class AttachmentScanStubService {
  scanByMetadata(input: {
    fileName: string;
    mimeType: string;
    sizeBytes?: number;
  }): ScanResult {
    if (REJECT_PATTERNS.some((pattern) => pattern.test(input.fileName))) {
      return { reason: "Filename matches a known dangerous pattern.", status: "rejected" };
    }
    if (input.mimeType === "application/x-msdownload") {
      return { reason: "Executable mime type rejected.", status: "rejected" };
    }
    if ((input.sizeBytes ?? 0) > LARGE_PAYLOAD_THRESHOLD) {
      return {
        reason: "Payload exceeds the inline-render threshold; serve via download.",
        status: "pending"
      };
    }
    return { status: "clean" };
  }
}
