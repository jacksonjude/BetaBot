export const emojis: Record<string, string>;
export const getEmoji: (shortcode: string) => string;
export const getShortcode: (emoji: string, addColons?: boolean, stripVariations?: boolean) => string;
export const emojify: (str: string) => string;
export const demojify: (str: string) => string;

export class EmojiError extends Error {
  public readonly name = 'EmojiError';
  public constructor(message?: string);
}
