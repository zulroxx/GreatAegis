/**
 * File text extraction utility.
 *
 * PDFs are parsed with pdf.js to extract readable text from compressed
 * streams (FlateDecode). Other text-based formats (.txt, .csv, .json,
 * .md, etc.) are read directly with FileReader.
 */

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDF_EXTENSIONS = [".pdf"];
const TEXT_EXTENSIONS = [
  ".txt", ".csv", ".json", ".md", ".tsv", ".log", ".xml", ".html", ".htm", ".yaml", ".yml",
];

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

function isPdf(name: string): boolean {
  return PDF_EXTENSIONS.includes(getExtension(name));
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.includes(getExtension(name));
}

/**
 * Extract readable text from a file.
 *
 * - PDF: uses pdf.js to decompress and extract text page by page.
 * - Text-based files: read directly with FileReader.readAsText.
 * - Unsupported binary formats (.docx, .doc): returns a placeholder
 *   explaining the limitation.
 */
export async function extractTextFromFile(file: File): Promise<{ text: string; unsupported?: boolean }> {
  if (isPdf(file.name)) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item) => ("str" in item ? (item as { str: string }).str : ""))
          .join(" ");
        fullText += pageText + "\n\n";
        page.cleanup();
      }
      await loadingTask.destroy();
      return { text: fullText.trim() };
    } catch (err) {
      return {
        text: `[Failed to extract text from PDF: ${err instanceof Error ? err.message : "unknown error"}]`,
        unsupported: true,
      };
    }
  }

  if (isTextFile(file.name)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ text: reader.result as string });
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  // .docx, .doc, and other binary office formats — not supported client-side
  return {
    text: `[File "${file.name}" is a binary office document. Text extraction for this format is not supported. Please convert to .txt or .pdf and re-attach.]`,
    unsupported: true,
  };
}
