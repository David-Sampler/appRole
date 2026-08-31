import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    ticketTypeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    eventTitle: { type: String, required: true },
    ticketTypeName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    totalPaid: { type: Number, required: true, min: 0 },
    code: { type: String, required: true, unique: true },
    checkedInAt: { type: Date },
    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'cancelled'],
      default: 'pending_payment',
    },
    paymentId: { type: String },
    paymentPreferenceId: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model('Ticket', ticketSchema);
