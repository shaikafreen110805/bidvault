const getMyProducts = async (req, res) => {
  try {
    console.log('🔍 Looking for products by seller:', req.user.id);
    console.log('🔍 Seller name:', req.user.name);
    
    const products = await Product.find({ seller: req.user.id }).sort({ createdAt: -1 }).lean();
    
    console.log(`🔍 Found ${products.length} products for this seller`);
    
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error in getMyProducts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};