import { useMemo } from 'react';

interface SearchItem {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b[i - 1] === a[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1,
              Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
            );
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyScore(query: string, item: SearchItem): number {
  const q = query.toLowerCase();
  const name = item.name.toLowerCase();
  const type = item.type.toLowerCase();
  const id = item.id.toLowerCase();

  let score = 0;

  // Exact prefix match on name gets highest score
  if (name.startsWith(q)) score += 100;
  else if (name.includes(q)) score += 50;

  // Type match
  if (type.startsWith(q)) score += 40;
  else if (type.includes(q)) score += 20;

  // ID match
  if (id.includes(q)) score += 15;

  // Fuzzy match on name
  const dist = levenshtein(q, name.slice(0, Math.max(q.length + 3, name.length)));
  if (dist <= 2) score += 30 - dist * 10;

  // Word boundary match
  const words = name.split(/[\s\-_]+/);
  for (const word of words) {
    if (word.startsWith(q)) score += 25;
  }

  return score;
}

export function useFuzzySearch(items: SearchItem[], query: string, limit = 10) {
  return useMemo(() => {
    const q = query.trim();
    if (!q) return [];

    return items
      .map((item) => ({ item, score: fuzzyScore(q, item) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item);
  }, [items, query, limit]);
}
