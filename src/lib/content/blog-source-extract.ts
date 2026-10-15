import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_CHARS = 40_000;
const MIN_CHARS = 20;

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractBlogSourceText(input: {
  bytes: ArrayBuffer;
  fileName: string;
  mimeType: string;
}): Promise<{ label: string; excerpt: string; mimeType: string }> {
  const name = input.fileName.trim() || "Document";
  const mime = input.mimeType || "";
  const lower = name.toLowerCase();
  const isPdf = mime === "application/pdf" || lower.endsWith(".pdf");
  const isDocx =
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx");

  if (!isPdf && !isDocx) {
    throw new Error("Alleen PDF of Word (.docx) worden ondersteund.");
  }

  let text = "";
  if (isPdf) {
    const proxy = await getDocumentProxy(new Uint8Array(input.bytes));
    const result = await extractText(proxy, { mergePages: true });
    const raw = result.text as string | string[];
    text = Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
  } else {
    const result = await mammoth.extractRawText({ arrayBuffer: input.bytes });
    text = result.value ?? "";
  }

  const excerpt = cleanExtractedText(text).slice(0, MAX_CHARS);
  if (excerpt.length < MIN_CHARS) {
    throw new Error("Kon geen bruikbare tekst uit dit bestand halen.");
  }

  return {
    label: name.replace(/\.(pdf|docx)$/i, ""),
    excerpt,
    mimeType: isPdf
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
}
