export const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEPRECATED_MARKER = '[deprecated] ';

// The extractor prepends this marker to deprecated signatures; strip it so
// signature comparison ignores deprecation status.
export const stripDeprecatedMarker = (signature: string): string =>
  signature.startsWith(DEPRECATED_MARKER) ? signature.slice(DEPRECATED_MARKER.length) : signature;
