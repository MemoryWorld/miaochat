import path from "node:path";

export type UploadReadyFile = {
  fileName: string;
  localPath: string;
  title: string;
};

export type FilePickerAdapter = {
  pickFiles: () => Promise<string[]>;
};

export type DesktopFileBridge = {
  selectForArtifactUpload: () => Promise<UploadReadyFile[]>;
};

export function createDesktopFileBridge(
  picker: FilePickerAdapter = {
    async pickFiles() {
      return [];
    }
  }
): DesktopFileBridge {
  return {
    async selectForArtifactUpload() {
      const selectedPaths = await picker.pickFiles();

      return selectedPaths.map((localPath) => {
        const fileName = path.basename(localPath);

        return {
          fileName,
          localPath,
          title: fileName
        };
      });
    }
  };
}
