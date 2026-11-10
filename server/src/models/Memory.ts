import { Schema, model } from 'mongoose';

// A durable fact Sol learned about the user (only stored when memory is enabled).
const memorySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true },
    source: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  },
  { timestamps: true },
);

export const Memory = model('Memory', memorySchema);
