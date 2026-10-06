export async function extractDocumentText(mime: string, name: string, bytes: Uint8Array): Promise<string> {
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return clean(await readPdf(bytes));
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) return clean(await readDocx(bytes));
  return "";
}

async function readPdf(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(bytes, { mergePages: true });
  return Array.isArray(text) ? text.join(" ") : text;
}

async function readDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 4000);
}
