import * as OpenCCModule from 'opencc-js';

let toTraditionalConverter: ((text: string) => string) | null = null;
let toSimplifiedConverter: ((text: string) => string) | null = null;

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
      const moduleRef = OpenCCModule as unknown as {
        Converter?: (options: {
          from: string;
          to: string;
        }) => (input: string) => string;
        default?: {
          Converter?: (options: {
            from: string;
            to: string;
          }) => (input: string) => string;
        };
      };

      const factory = moduleRef.Converter ?? moduleRef.default?.Converter;
      if (!factory) {
        throw new Error('OpenCC Converter not available');
      }
      toTraditionalConverter = factory({ from: 'cn', to: 'tw' });
    }
    return toTraditionalConverter(text);
  } catch {
    return text;
  }
}

/**
 * Convert Traditional Chinese text to Simplified Chinese before sending requests to Douban.
 * Falls back to the original text if conversion fails or the input is empty.
 */
export function convertToSimplified(text: string | undefined | null): string {
  if (!text) {
    return '';
  }

  try {
    if (!toSimplifiedConverter) {
      const moduleRef = OpenCCModule as unknown as {
        Converter?: (options: {
          from: string;
          to: string;
        }) => (input: string) => string;
        default?: {
          Converter?: (options: {
            from: string;
            to: string;
          }) => (input: string) => string;
        };
      };

      const factory = moduleRef.Converter ?? moduleRef.default?.Converter;
      if (!factory) {
        throw new Error('OpenCC Converter not available');
      }
      toSimplifiedConverter = factory({ from: 'tw', to: 'cn' });
    }
    return toSimplifiedConverter(text);
  } catch {
    return text;
  }
}
