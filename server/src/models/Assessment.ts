import { Schema, model } from 'mongoose';

const assessmentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    answers: { type: [Number], required: true },
    score: { type: Number, required: true }, // 0-100
    band: { type: String, enum: ['flourishing', 'steady', 'stretched', 'depleted'], required: true },
  },
  { timestamps: true },
);

export const Assessment = model('Assessment', assessmentSchema);
