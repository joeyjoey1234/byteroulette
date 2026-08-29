const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function sanitizeFilename(input: string): string {
  const normalized = Array.from(input.normalize('NFC'), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 || character === '/' || character === '\\' ? '_' : character;
  })
    .join('')
    .trim();
  const withoutTraversal = normalized.replace(/^\.+/, '').replace(/[. ]+$/, '');
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    withoutTraversal,
  );
  const bounded = Array.from(segments, (item) => item.segment)
    .slice(0, 180)
    .join('');
  if (!bounded || WINDOWS_RESERVED.test(bounded)) return 'received-file';
  return bounded;
}
