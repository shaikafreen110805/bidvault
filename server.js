const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import models
const User = require('./models/User');
const Product = require('./models/Product');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Make io available
app.set('io', io);

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============ AUTH ROUTES ============
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    const user = await User.create({ name, email, password });
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret123', { expiresIn: '30d' });
    
    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get me
app.get('/api/auth/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    const user = await User.findById(decoded.id);
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(401).json({ success: false });
  }
});

// Logout
app.get('/api/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

// ============ AUTH MIDDLEWARE ============
const protect = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    req.user = await User.findById(decoded.id);
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ============ PRODUCT ROUTES ============

// Get all products
app.get('/api/products', protect, async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).populate('seller', 'name').sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get my products
// Get my products - FIXED VERSION
app.get('/api/products/my-products', protect, async (req, res) => {
  try {
    console.log('📦 Looking for products by seller ID:', req.user.id);
    console.log('📦 Seller name:', req.user.name);
    
    const products = await Product.find({ seller: req.user.id }).sort({ createdAt: -1 });
    
    console.log(`📦 Found ${products.length} products for this seller`);
    
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error in my-products:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get my bids
app.get('/api/products/my-bids', protect, async (req, res) => {
  try {
    const products = await Product.find({ 'bids.bidder': req.user.id });
    const myBids = [];
    products.forEach(p => {
      p.bids.forEach(b => {
        if (b.bidder.toString() === req.user.id) {
          myBids.push({ ...b.toObject(), product: p });
        }
      });
    });
    res.json({ success: true, data: myBids });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single product
app.get('/api/products/:id', protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('seller', 'name');
    if (!product) return res.status(404).json({ success: false });
    res.json({ success: true, data: product, bids: product.bids || [] });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// Create product
app.post('/api/products', protect, async (req, res) => {
  try {
    const { name, description, category, emoji, startingPrice, endTime } = req.body;
    
    const product = await Product.create({
      name,
      description,
      category: category || 'General',
      emoji: emoji || '📦',
      startingPrice: Number(startingPrice),
      currentPrice: Number(startingPrice),
      endTime,
      seller: req.user.id,
      sellerName: req.user.name,
      bids: [],
      bidCount: 0,
      isActive: true
    });
    
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Place bid
app.post('/api/products/:id/bid', protect, async (req, res) => {
  try {
    const { amount } = req.body;
    const product = await Product.findById(req.params.id);
    
    if (!product) return res.status(404).json({ success: false });
    if (!product.isActive || new Date(product.endTime) < new Date()) {
      return res.status(400).json({ success: false, message: 'Auction ended' });
    }
    if (amount <= product.currentPrice) {
      return res.status(400).json({ success: false, message: `Bid must be > $${product.currentPrice}` });
    }
    if (product.seller.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot bid on your own item' });
    }
    
    product.bids.push({
      bidder: req.user.id,
      bidderName: req.user.name,
      amount: Number(amount),
      createdAt: new Date()
    });
    product.currentPrice = Number(amount);
    product.bidCount = product.bids.length;
    await product.save();
    
    const io = req.app.get('io');
    io.emit('new-bid', {
      productId: product._id,
      productName: product.name,
      bidder: { name: req.user.name },
      amount: Number(amount)
    });
    
    res.json({ success: true, message: 'Bid placed!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// ============ SERVE FRONTEND ============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ START SERVER ============
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/bidvault')
  .then(() => {
    console.log('✅ MongoDB Connected');
    server.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`\n✅ Login with: demo@example.com / 123456\n`);
    });
  })
  .catch(err => {
    console.error('Database error:', err);
  });