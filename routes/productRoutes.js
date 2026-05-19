const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { createProduct, getAllProducts, getProductById, placeBid, getMyProducts, getMyBids } = require('../controllers/productController');

router.use(protect);
router.route('/').get(getAllProducts).post(createProduct);
router.get('/my-products', getMyProducts);
router.get('/my-bids', getMyBids);
router.get('/:id', getProductById);
router.post('/:id/bid', placeBid);

module.exports = router;