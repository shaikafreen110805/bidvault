const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  bidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bidderName: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  description: { type: String, required: true },
  category: { type: String, default: 'General', index: true },
  emoji: { type: String, default: '📦' },
  startingPrice: { type: Number, required: true, min: 0 },
  currentPrice: { type: Number, required: true, default: 0 },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sellerName: { type: String, required: true },
  endTime: { type: Date, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
  bids: [bidSchema],
  bidCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Auto-set currentPrice and indexes
productSchema.pre('save', function(next) {
  if (this.isNew && this.currentPrice === 0) {
    this.currentPrice = this.startingPrice;
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);