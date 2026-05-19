// config/db.js - Database connection setup
// Think of this as your phone dialer that calls MongoDB Atlas

const mongoose = require('mongoose');

// The 'dotenv' package loads your secret keys from .env file
require('dotenv').config();

// Get the connection string from your .env file
const MONGO_URI = process.env.MONGO_URI;

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    // Attempt to connect to the database
    // NOTE: useNewUrlParser and useUnifiedTopology are now enabled by default in Mongoose 8+
    // So we don't need to specify them anymore!
    const conn = await mongoose.connect(MONGO_URI);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database Name: ${conn.connection.name}`);
    
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Exit the process with failure (code 1)
    process.exit(1);
  }
};

module.exports = connectDB;