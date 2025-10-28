import { Converter } from 'opencc-js';

let toTraditionalConverter: ((text: string) => string) | null = null;

/**
 * Convert Simplified Chinese text to Traditional Chinese for display purposes.
 * Falls back to the original text if conversion fails or the input is empty.
 */
export function convertToTraditional(text: string | undefined | null): string {
  if (!text) {
    return '';
  }

  try {
    if (!toTraditionalConverter) {
      toTraditionalConverter = Converter({ from: 'cn', to: 'tw' });
    }
    return toTraditionalConverter(text);
  } catch {
    return text;
  }
}
