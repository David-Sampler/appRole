import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    name: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    seatsLeft: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['available', 'sold'], default: 'available' },
    code: { type: String, required: true, unique: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Group', groupSchema);
