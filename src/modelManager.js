import { ModelManager } from "@accordproject/concerto-core";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import path from "path";

export class ModelManagerUtil {
  /**
   * Create a ModelManager instance from a CTO file.
   * @param {string} ctoFilePath - the path to the CTO file.
   * @return {ModelManager} a ModelManager instance.
   */
  static createModelManagerFromCTO(ctoFilePath) {
    try {
      const modelManager = new ModelManager({
        strict: true,
        skipLocationNodes: true,
      });

      const ctoContent = fs.readFileSync(ctoFilePath, "utf8");
      modelManager.addCTOModel(ctoContent);
      modelManager.validateModelFiles();

      return modelManager;
    } catch (error) {
      console.error("Error creating ModelManager:", error);
      throw new Error(`Failed to create ModelManager: ${error.message}`);
    }
  }
}
