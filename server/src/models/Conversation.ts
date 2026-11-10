import { Schema, model } from 'mongoose';

const messageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    // Activities Sol suggested alongside this reply (rendered as tappable chips).
    suggestions: {
      type: [{ kind: String, label: String, _id: false }],
      default: [],
    },
    detectedMood: { type: String, default: null },
    safety: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const conversationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'New conversation' },
    summary: { type: String, default: '' },
    lastMood: { type: String, default: null },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true },
);

export const Conversation = model('Conversation', conversationSchema);
