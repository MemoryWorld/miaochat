import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";

import {
  extractDeployFilesFromBuffer,
  selectContainerIndexHtml
} from "../src/activities/deploy-artifact-bundle.js";

describe("deploy artifact bundle", () => {
  it("extracts safe zip files for deploy providers", () => {
    const zip = new AdmZip();
    zip.addFile("index.html", Buffer.from("<h1>Miaochat</h1>", "utf8"));
    zip.addFile("assets/app.js", Buffer.from("console.log('ok')", "utf8"));

    const files = extractDeployFilesFromBuffer(zip.toBuffer(), {
      artifactTitle: "Marketing Site",
      fallbackFileName: "artifact.html",
      storageKey: "artifacts/site.zip"
    });

    expect(files.map((file) => file.path)).toEqual([
      "index.html",
      "assets/app.js"
    ]);
    expect(selectContainerIndexHtml(files, "Marketing Site")).toContain("Miaochat");
  });

  it("rejects zip entries that escape the deployment root", () => {
    const zip = new AdmZip();
    zip.addFile("good.txt", Buffer.from("nope", "utf8"));
    const maliciousZip = Buffer.from(
      zip.toBuffer().toString("binary").replaceAll("good.txt", "../a.txt"),
      "binary"
    );

    expect(() =>
      extractDeployFilesFromBuffer(maliciousZip, {
        artifactTitle: "Bad Site",
        fallbackFileName: "artifact.html",
        storageKey: "artifacts/bad.zip"
      })
    ).toThrow(/unsafe path/i);
  });

  it("reads deploy JSON manifests without requiring a zip file", () => {
    const files = extractDeployFilesFromBuffer(
      Buffer.from(
        JSON.stringify({
          files: [
            {
              content: "<html><body>Manifest</body></html>",
              path: "index.html"
            }
          ]
        }),
        "utf8"
      ),
      {
        artifactTitle: "Manifest Site",
        fallbackFileName: "artifact.html",
        storageKey: "artifacts/site.deploy.json"
      }
    );

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("index.html");
    expect(files[0]?.data.toString("utf8")).toContain("Manifest");
  });
});
