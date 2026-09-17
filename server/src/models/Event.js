import mongoose from 'mongoose';

const ticketTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  quantityAvailable: { type: Number, required: true, min: 1 },
  quantitySold: { type: Number, required: true, default: 0, min: 0 },
});

const eventSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organizerName: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    location: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true },
    ticketTypes: { type: [ticketTypeSchema], required: true, validate: (v) => v.length > 0 },
    status: { type: String, enum: ['active', 'cancelled', 'deleted'], default: 'active' },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Event', eventSchema);
