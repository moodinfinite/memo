/**
 * Levenshtein distance — counts minimum edits (insert/delete/replace)
 * to transform string a into string b.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function normalise(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()']/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Returns true if the user's answer is close enough to the correct answer.
 * Tolerance: up to 20% of the correct answer length, min 1 edit for short words.
 */
export function isFuzzyMatch(userAnswer: string, correctAnswer: string): boolean {
  const a = normalise(userAnswer)
  const b = normalise(correctAnswer)

  if (a === b) return true
  if (a.length === 0) return false

  // For long definitions, also accept if any individual sentence matches
  const sentences = b.split(/[.;]/).map((s) => s.trim()).filter(Boolean)
  for (const sentence of sentences) {
    if (sentence.length > 10) {
      const dist = levenshtein(a, sentence)
      const tolerance = Math.max(1, Math.floor(sentence.length * 0.2))
      if (dist <= tolerance) return true
    }
  }

  const dist = levenshtein(a, b)
  const tolerance = Math.max(1, Math.floor(b.length * 0.2))
  return dist <= tolerance
}

/**
 * Returns a score 0–1 of similarity between two strings.
 */
export function similarityScore(a: string, b: string): number {
  const na = normalise(a)
  const nb = normalise(b)
  if (na === nb) return 1
  const dist = levenshtein(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return maxLen === 0 ? 1 : 1 - dist / maxLen
}
