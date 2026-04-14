import type { AnchorData, ThreadRecord } from "./schema";

const CONTEXT_RADIUS = 40;

export type AnchorConfidence = "exact" | "fuzzy" | "orphaned";

export interface ResolvedAnchor {
  start: number;
  end: number;
  confidence: AnchorConfidence;
}

export function buildAnchorFromOffsets(source: string, start: number, end: number): AnchorData | null {
  const safeStart = Math.max(0, Math.min(start, source.length));
  const safeEnd = Math.max(safeStart, Math.min(end, source.length));
  const quote = source.slice(safeStart, safeEnd).trim();

  if (!quote) {
    return null;
  }

  return {
    quote,
    prefix: source.slice(Math.max(0, safeStart - CONTEXT_RADIUS), safeStart),
    suffix: source.slice(safeEnd, Math.min(source.length, safeEnd + CONTEXT_RADIUS)),
    startHint: safeStart,
    endHint: safeEnd,
    currentStart: safeStart,
    currentEnd: safeEnd
  };
}

export function buildAnchorFromQuote(source: string, quote: string): AnchorData | null {
  const rawQuote = quote.trim();
  if (!rawQuote) {
    return null;
  }

  const exactIndex = source.indexOf(rawQuote);
  if (exactIndex >= 0) {
    return buildAnchorFromOffsets(source, exactIndex, exactIndex + rawQuote.length);
  }

  const collapsedWhitespaceIndex = findByCollapsedWhitespace(source, rawQuote);
  if (collapsedWhitespaceIndex >= 0) {
    return buildAnchorFromOffsets(source, collapsedWhitespaceIndex, collapsedWhitespaceIndex + rawQuote.length);
  }

  const fuzzyIndex = findBestFuzzyMatch(source, rawQuote, Math.floor(source.length / 2));
  if (fuzzyIndex >= 0) {
    return buildAnchorFromOffsets(source, fuzzyIndex, fuzzyIndex + rawQuote.length);
  }

  return null;
}

export function resolveAnchor(source: string, anchor: AnchorData): ResolvedAnchor {
  const quote = anchor.quote.trim();
  if (!quote) {
    return {
      start: -1,
      end: -1,
      confidence: "orphaned"
    };
  }

  const byHint = tryHint(source, anchor);
  if (byHint !== null) {
    return {
      start: byHint,
      end: byHint + quote.length,
      confidence: "exact"
    };
  }

  const exactIndex = source.indexOf(quote);
  if (exactIndex >= 0) {
    return {
      start: exactIndex,
      end: exactIndex + quote.length,
      confidence: "exact"
    };
  }

  const fuzzyIndex = findBestFuzzyMatch(source, quote, anchor.startHint);
  if (fuzzyIndex >= 0) {
    return {
      start: fuzzyIndex,
      end: Math.min(source.length, fuzzyIndex + quote.length),
      confidence: "fuzzy"
    };
  }

  return {
    start: -1,
    end: -1,
    confidence: "orphaned"
  };
}

function tryHint(source: string, anchor: AnchorData): number | null {
  const quote = anchor.quote.trim();
  const startHint = anchor.currentStart ?? anchor.startHint;
  const candidates = [startHint, anchor.startHint];

  for (const candidate of candidates) {
    if (candidate < 0 || candidate >= source.length) {
      continue;
    }

    const windowStart = Math.max(0, candidate - 256);
    const windowEnd = Math.min(source.length, candidate + quote.length + 256);
    const window = source.slice(windowStart, windowEnd);
    const inWindow = window.indexOf(quote);
    if (inWindow >= 0) {
      return windowStart + inWindow;
    }
  }

  return null;
}

function findBestFuzzyMatch(source: string, quote: string, hint: number): number {
  if (quote.length < 8 || source.length < quote.length) {
    return -1;
  }

  const step = Math.max(1, Math.floor(quote.length / 6));
  const regions = computeRegions(source.length, hint, quote.length);
  let bestScore = 0;
  let bestIndex = -1;

  for (const [start, end] of regions) {
    for (let i = start; i <= end - quote.length; i += step) {
      const candidate = source.slice(i, i + quote.length);
      const score = diceCoefficient(normalize(candidate), normalize(quote));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
  }

  return bestScore >= 0.72 ? bestIndex : -1;
}

function computeRegions(sourceLength: number, hint: number, quoteLength: number): Array<[number, number]> {
  const radius = 4000;
  const regions: Array<[number, number]> = [];

  if (hint >= 0 && hint < sourceLength) {
    const nearStart = Math.max(0, hint - radius);
    const nearEnd = Math.min(sourceLength, hint + radius + quoteLength);
    regions.push([nearStart, nearEnd]);
  }

  regions.push([0, sourceLength]);
  return regions;
}

function normalize(value: string): string {
  return normalizeForMatching(value);
}

function normalizeForMatching(value: string): string {
  return normalizeSmartPunctuation(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeSmartPunctuation(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");
}

function findByCollapsedWhitespace(source: string, quote: string): number {
  const collapsedSource = collapseWhitespaceWithMap(source);
  const collapsedQuote = collapseWhitespaceOnly(quote);
  if (!collapsedQuote) {
    return -1;
  }

  const index = collapsedSource.text.indexOf(collapsedQuote);
  if (index < 0) {
    return -1;
  }

  return collapsedSource.map[index] ?? -1;
}

function collapseWhitespaceWithMap(value: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (/\s/.test(ch)) {
      if (chars.length > 0) {
        pendingSpace = true;
      }
      continue;
    }

    if (pendingSpace) {
      chars.push(" ");
      map.push(i);
      pendingSpace = false;
    }

    chars.push(ch);
    map.push(i);
  }

  if (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    map.pop();
  }

  const text = chars.join("");
  if (!text) {
    return { text: "", map: [] };
  }

  return { text, map };
}

function collapseWhitespaceOnly(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) {
    return 1;
  }
  if (a.length < 2 || b.length < 2) {
    return 0;
  }

  const pairs = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const pair = a.slice(i, i + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const pair = b.slice(i, i + 2);
    const count = pairs.get(pair) ?? 0;
    if (count > 0) {
      pairs.set(pair, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (a.length + b.length - 2);
}

export function reanchorThread(source: string, thread: ThreadRecord): { thread: ThreadRecord; changed: boolean } {
  const resolution = resolveAnchor(source, thread.anchor);
  let changed = false;

  const nextThread: ThreadRecord = {
    ...thread,
    anchor: {
      ...thread.anchor
    }
  };

  if (resolution.confidence === "orphaned") {
    if (nextThread.anchor.currentStart !== null || nextThread.anchor.currentEnd !== null) {
      nextThread.anchor.currentStart = null;
      nextThread.anchor.currentEnd = null;
      changed = true;
    }

    if (nextThread.status !== "resolved" && nextThread.status !== "orphaned") {
      nextThread.status = "orphaned";
      changed = true;
    }

    return { thread: nextThread, changed };
  }

  if (nextThread.anchor.currentStart !== resolution.start || nextThread.anchor.currentEnd !== resolution.end) {
    nextThread.anchor.currentStart = resolution.start;
    nextThread.anchor.currentEnd = resolution.end;
    changed = true;
  }

  if (nextThread.status === "orphaned") {
    nextThread.status = "open";
    changed = true;
  }

  return { thread: nextThread, changed };
}
