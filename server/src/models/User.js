import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String },
    role: { type: String, enum: ['organizer', 'buyer'], required: true },
    resetCode: { type: String },
    resetCodeExpiresAt: { type: Date },
    resetCodeAttempts: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: true },
    verifyCode: { type: String },
    verifyCodeExpiresAt: { type: Date },
    verifyCodeAttempts: { type: Number, default: 0 },
    // incrementa ao trocar/redefinir senha: invalida os logins (tokens) emitidos antes
    tokenVersion: { type: Number, default: 0 },
    mpUserId: { type: String },
    mpAccessToken: { type: String },
    mpRefreshToken: { type: String },
    mpConnectedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
