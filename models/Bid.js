// models/Bid.js - Records of all bids placed
const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  bidder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Bid amount is required'],
    min: [0, 'Bid amount cannot be negative']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
bidSchema.index({ product: 1, amount: -1 });

module.exports = mongoose.model('Bid', bidSchema);