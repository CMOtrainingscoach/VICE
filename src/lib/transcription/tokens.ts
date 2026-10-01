import { encode, decode } from "gpt-tokenizer/model/gpt-4o";

/** cl100k_base — compact opslag + direct bruikbaar voor LLM-analyse later. */
export function textToTokenIds(text: string): number[] {
  return encode(text);
}

export function tokenIdsToText(tokenIds: number[]): string {
  return decode(tokenIds);
}

export function estimateTokenStorageBytes(tokenCount: number): number {
  return tokenCount * 4;
}
