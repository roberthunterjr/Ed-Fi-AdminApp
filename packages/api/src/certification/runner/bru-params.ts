export interface QueryParamEntry {
  name: string;
  value: string;
}

export interface InputParam {
  name: string;
  /** The exact `[ENTER ...]` text the user's value replaces. */
  token: string;
  description: string | null;
}

/** The text between the braces of `params:query { ... }`, or null when the step has none. */
const extractQueryParamsBlock = (bruContent: string): string | null => {
  const startMatch = /^params:query\s*\{/m.exec(bruContent);
  if (!startMatch) return null;

  const startBraceIndex = startMatch.index + startMatch[0].lastIndexOf('{');
  let depth = 1;
  for (let i = startBraceIndex + 1; i < bruContent.length; i++) {
    const ch = bruContent[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return bruContent.slice(startBraceIndex + 1, i);
  }
  return null;
};

/**
 * The enabled `name: value` lines of `params:query`. Blank lines, `#` comments and
 * disabled (`~name`) lines are not parameters. The one place `.bru` query params are parsed.
 */
export const parseQueryParams = (bruContent: string): QueryParamEntry[] => {
  const block = extractQueryParamsBlock(bruContent);
  if (!block) return [];

  const entries: QueryParamEntry[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('~')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    entries.push({
      name: trimmed.slice(0, colonIdx).trim(),
      value: trimmed.slice(colonIdx + 1).trim(),
    });
  }
  return entries;
};

/** The enabled params whose value is `[ENTER ...]`: the ones the user fills in. */
export const parseInputParams = (bruContent: string): InputParam[] =>
  parseQueryParams(bruContent)
    .filter(({ value }) => /^\[ENTER/i.test(value))
    .map(({ name, value }) => ({
      name,
      token: value,
      description:
        value
          .replace(/^\[ENTER[\s_]*/i, '')
          .replace(/]$/, '')
          .trim() || null,
    }));
