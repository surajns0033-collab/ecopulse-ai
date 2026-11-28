// @ts-check
import { z } from 'zod';

const photoType = z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const maxImageChars = 1_800_000;

const message = z.strictObject({
  role: z.enum(['user', 'assistant', 'ai', 'model']),
  text: z.string().min(1).max(16_000).refine(value => value.trim().length > 0),
});

const image = z.strictObject({
  mimeType: photoType,
  base64: z.string().refine(value =>
    value.length <= maxImageChars && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)),
});

export const chatRequestSchema = z.strictObject({
  messages: z.array(message).min(1).max(16),
  images: z.array(image).max(1).default([]),
  system: z.string().max(24_000).default(''),
  useSearch: z.boolean().default(false),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.int().min(64).max(2048).default(600),
  timeoutMs: z.int().positive().default(30_000),
  mode: z.enum(['', 'chat']).optional(),
  model: z.string().max(128).optional(),
}).refine(input => input.messages.at(-1)?.role === 'user' &&
  input.messages.reduce((total, item) => total + item.text.length, 0) <= 48_000)
  .refine(input => !input.useSearch || input.images.length === 0)
  .transform(/** @returns {import('./chatSchema.ts').ChatRequest} */ (input) => {
    const history = input.useSearch ? input.messages.slice(-1) : input.messages;
    /** @type {import('./chatSchema.ts').ChatMessage[]} */
    const messages = history.map(({ role, text }) => ({
      role: role === 'user' ? 'user' : 'assistant', text: text.trim(),
    }));
    return {
      messages, images: input.images, system: input.useSearch ? '' : input.system,
      useSearch: input.useSearch, temperature: input.temperature, maxTokens: input.maxTokens,
      timeoutMs: Math.min(input.timeoutMs, 40_000),
    };
  });
