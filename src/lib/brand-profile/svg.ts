const BLOCKED = /<script[\s\S]*?>[\s\S]*?<\/script>|<\/?script\b|javascript:|data:text\/html|<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>|<\/?foreignObject\b|<iframe[\s\S]*?>[\s\S]*?<\/iframe>|<\/?iframe\b/gi;

export function sanitizeSvg(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed.startsWith("<svg") && !trimmed.includes("<svg")) return null;
  let text = trimmed.replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(BLOCKED, "");
  text = text.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  text = text.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  text = text.replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, "");
  if (!/<svg[\s>]/i.test(text)) return null;
  if (/<script|javascript:|foreignObject|<iframe/i.test(text)) return null;
  return text;
}
