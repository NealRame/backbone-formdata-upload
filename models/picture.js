// models/picture.js
// -----------------
// - author: Neal.Rame. <contact@nealrame.com>
// -   date: Mon Jan 19 22:25:36 CET 2015

var _ = require('underscore');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var GridFs = require('gridfs-stream');
var gm = require('gm');
var path = require('path');
var mongo = mongoose.mongo;

var inspect = require('util').inspect;

/// ### Fields
var PictureSchema = new Schema({
    /// #### date
    /// Date of creation of this picture. Default value is 'Date.now'.
    date: {
        type: Date,
        default: Date.now
    },
    /// #### prefix
    /// Prepended to `original` or `thumbnail` ids to create path.
    /// Default value is 'files'.
    prefix: {
        type: String,
        default: 'files'
    },
    /// #### original
    /// _REQUIRED_. Id of the original file.
    original: {
        type: Schema.Types.ObjectId,
        required: true
    },
    /// #### thumbnail
    /// _REQUIRED_. Id of the thumbnail file.
    thumbnail: {
        type: Schema.Types.ObjectId,
        required: true
    },
    /// #### height
    /// _REQUIRED_. Height in pixels of the original picture.
    height: {
        type: Number,
        required: true
    },
    /// #### width
    /// _REQUIRED_. Width in pixels of the original picture.
    width: {
        type: Number,
        required: true
    },
});

//// #### ratio
//// _Virtual_. Ratio of width to height.
PictureSchema.virtual('ratio').get(function() {
    return this.width/this.height;
});

/// ### Methods

/// #### `Picture#originalPath()`
/// Returns the path of the original picture files.
PictureSchema.methods.originalPath = function() {
    return path.join('/', this.prefix, this.original);
}

/// #### `Picture#thumbnailPath()`
/// Returns the path of the thumbnail picture files.
PictureSchema.methods.thumbnailPath = function() {
    return path.join('/', this.prefix, this.thumbnail);
}

/// #### `Picture.create(original, [cb])`
/// Create a picture instance with the given image.
///
/// _Parameters:_
/// - original
/// - cb
PictureSchema.static('create', function(original, cb) {
    var promise = new mongoose.Promise;
    var gfs = GridFs(mongoose.connection.db, mongo);
    var data = {
        original: original.id
    };

    var Model = this;

    gm(gfs.createReadStream({_id: original.id}))
        .size({bufferStream: true}, function(err, size) {
            if (err) {
                return promise.error(err);
            }

            var thumbnail_id = new mongo.ObjectID;
            var ostream = gfs.createWriteStream({
                _id: thumbnail_id,
                contentType: original.mime,
                metadata: {original: original.id}
            });

            _.bindAll(promise, 'resolve', 'error');
            _.extend(data, {thumbnail: thumbnail_id}, size);
            ostream
                .once('error', function(err) {
                    gfs.remove({_id: id.toString()}, promise.error);
                })
                .once('close', function() {
                    (new Model(data)).save(promise.resolve);
                });

            this.resize(256).stream().pipe(ostream);
        });

    if (cb) {
        promise.addBack(cb);
    }

    return promise;
});

var Picture = module.exports = mongoose.model('Picture', PictureSchema);
