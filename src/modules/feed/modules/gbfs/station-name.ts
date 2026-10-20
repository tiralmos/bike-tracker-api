// Small words that stay lowercase inside a name ("Place de la Bourse"),
// but not as the first word ("Les Halles").
const LOWERCASE_WORDS = new Set([
  "à",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "en",
  "et",
  "l",
  "la",
  "le",
  "les",
  "sur",
])

// Words that are clearer kept in capitals.
const UPPERCASE_WORDS = new Set([
  "ii",
  "iii",
  "iv",
  "iut",
  "rvi",
  "sncf",
  "tcl",
  "zi",
  "za",
])

/**
 * Turns an all-caps station name such as "SACRE COEUR" or
 * "PART-DIEU / RUE DE LA VILLETTE" into "Sacre Coeur" or
 * "Part-Dieu / Rue de la Villette". Names that already contain lowercase
 * letters are returned unchanged.
 */
export function prettifyStationName(name: string): string {
  if (name !== name.toUpperCase()) return name

  let isFirstWord = true

  // Split into words and the separators between them, keeping both.
  return name.replace(/\p{L}[\p{L}\p{N}]*|\p{N}[\p{L}\p{N}]*/gu, (word) => {
    const lower = word.toLowerCase()
    const first = isFirstWord
    isFirstWord = false

    if (UPPERCASE_WORDS.has(lower)) return word
    // Ordinals and numbers like "4E" or "2025".
    if (/^\p{N}/u.test(word)) return lower
    if (!first && LOWERCASE_WORDS.has(lower)) return lower

    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
}
