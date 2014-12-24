var express = require('express');
var router = express.Router();

module.exports = router.use('/products', require('routes/api/products'));
