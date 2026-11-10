import { Schema, model, InferSchemaType } from 'mongoose';

const reminderSchema = new Schema(
  {
    id: { type: String, required: true },
    kind: {
      type: String,
      enum: ['checkin', 'affirmation', 'breathing', 'selfcare', 'custom'],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    hour: { type: Number, min: 0, max: 23, required: true },
    minute: { type: Number, min: 0, max: 59, required: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Profile setup collected right after sign-up; feeds the companion's context.
    goals: { type: [String], default: [] },
    // Tone shapes both Sol's words and its voice; gentle/grounded are kept for older accounts.
    companionTone: { type: String, enum: ['warm', 'soft', 'cheerful', 'calm', 'gentle', 'grounded'], default: 'warm' },
    voiceGender: { type: String, enum: ['female', 'male'], default: 'female' },
    // The chosen character (see services/tts.ts CHARACTER_VOICES); empty = the default for voiceGender.
    voiceName: { type: String, default: '' },
    preferVoice: { type: Boolean, default: true },
    // User-controlled consent for Sol to remember facts across conversations.
    memoryEnabled: { type: Boolean, default: true },
    reminders: { type: [reminderSchema], default: [] },
    onboarded: { type: Boolean, default: false },
    // Where they are (city level, from the phone, with permission), so Sol knows their world.
    location: { type: String, default: '', trim: true },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const User = model('User', userSchema);
