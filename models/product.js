var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var Picture = new mongoose.Schema({
    original: Schema.Types.ObjectId,
    thumbnail: Schema.Types.ObjectId
}, {_id: false});

var ProductSchema = new Schema({
    // Date of creation of this product
    date: {
        type: Date,
        default: Date.now
    },
    // The name of this product
    name: String,
    // A short description of this product
    description: String,
    // A list of picture of this product
    pictures: [Picture],
    // Tag list for this product
    tags: [String],
    // Published flag
    published: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Product', ProductSchema);
