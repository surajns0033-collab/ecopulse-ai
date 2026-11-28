// Compile-time contract for the normalized chat body consumed by AI providers.
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
  base64: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  images: ChatImage[];
  system: string;
  useSearch: boolean;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}
