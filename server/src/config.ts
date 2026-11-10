import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/solace',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  anthropicKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
  model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  // Without an Anthropic key, use a free keyless model; set FREE_AI=off for offline replies only.
  freeAi: process.env.FREE_AI !== 'off',
  // Free Groq key (console.groq.com): fast replies and accurate speech-to-text. Optional.
  groqKey: process.env.GROQ_API_KEY ?? '',
  groqModel: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
};
