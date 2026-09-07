/**
 * Reusable HTML entity decoder utility.
 * Decodes named, decimal numeric, and hexadecimal numeric HTML entities.
 * Safe presentation-layer utility: does NOT use innerHTML or dangerouslySetInnerHTML.
 */

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: ' ',
  iexcl: '¡',
  cent: '¢',
  pound: '£',
  curren: '¤',
  yen: '¥',
  brvbar: '¦',
  sect: '§',
  uml: '¨',
  copy: '©',
  ordf: 'ª',
  laquo: '«',
  not: '¬',
  shy: '\u00AD',
  reg: '®',
  macr: '¯',
  deg: '°',
  plusmn: '±',
  sup2: '²',
  sup3: '³',
  acute: '´',
  micro: 'µ',
  para: '¶',
  middot: '·',
  cedil: '¸',
  sup1: '¹',
  ordm: 'º',
  raquo: '»',
  frac14: '¼',
  frac12: '½',
  frac34: '¾',
  iquest: '¿',
  times: '×',
  divide: '÷',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  dagger: '†',
  Dagger: '‡',
  bull: '•',
  hellip: '…',
  permil: '‰',
  prime: '′',
  Prime: '″',
  lsaquo: '‹',
  rsaquo: '›',
  oline: '‾',
  frasl: '⁄',
  euro: '€',
  trade: '™',
};

const HTML_ENTITY_REGEX = /&(?:#(?:x([0-9a-fA-F]+)|([0-9]+))|([a-zA-Z]+));/g;

/**
 * Decodes HTML entities in a given string.
 * Examples:
 *   &#039; -> '
 *   &quot; -> "
 *   &amp; -> &
 *   &lt; -> <
 *   &gt; -> >
 */
export function decodeHtmlEntities(text?: string | null): string {
  if (text == null) return '';
  if (typeof text !== 'string') return String(text);
  if (!text.includes('&')) return text;

  return text.replace(HTML_ENTITY_REGEX, (match, hex, dec, named) => {
    if (dec) {
      const codePoint = parseInt(dec, 10);
      if (!isNaN(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }

    if (hex) {
      const codePoint = parseInt(hex, 16);
      if (!isNaN(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
      return match;
    }

    if (named) {
      const decoded = NAMED_ENTITIES[named] || NAMED_ENTITIES[named.toLowerCase()];
      return decoded ?? match;
    }

    return match;
  });
}
