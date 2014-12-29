var _ = require('underscore');
var async = require('async');
var express = require('express');
var formidableGrid = require('formidable-grid');
var gm = require('gm');
var GridFs = require('gridfs-stream');
var mongo = require('mongodb');
var mongoose = require('mongoose');
var path = require('path');
var Product = require('models/product');
var querystring = require('querystring');

var inspect = require('util').inspect;

var router = express.Router();

function error(res, err) {
    var err = err || new Error('Internal server error');
    var status = err.status || 500;

    res.status(status).send({
        status: status,
        message: err.message
    });
};

function create_picture(gfs, file) {
    var promise = new mongoose.Promise;

    if (_.isString(file.thumbnail) && _.isString(file.original)) {
        promise.fulfill({
            original:  new mongo.ObjectID(file.original),
            thumbnail: new mongo.ObjectID(file.thumbnail)
        });
        return promise;
    }

    if (! file.name) {
        promise.error(new Error('Invalid data'));
        return promise;
    }

    var ext = path.extname(file.name);
    var thumb = {
        id: new mongo.ObjectID,
        lastModified: new Date,
        name: path.basename(file.name, ext) + '-thumb' + ext,
        mime: file.mime
    };
    var input_stream = gfs.createReadStream({
        _id: file.id
    });
    var output_stream = gfs.createWriteStream({
        _id: thumb.id,
        filename: thumb.name,
        contentType: thumb.mime,
        metadata: {
            original: file.id
        }
    });

    output_stream
        .once('error', promise.error.bind(promise))
        .once('close', promise.fulfill.bind(promise, {
            original: file.id,
            thumbnail: thumb.id
        }));

    gm(input_stream, file.name)
        .size({bufferStream: true}, function(err, size) {
            if (err) {
                return next(err);
            }

            var ratio = 1; // FIXME: read this in preferences
            var w, h, x, y;

            if (size.width >= size.height) {
                w = size.height*ratio;

                if (w > size.width) {
                    w = size.width;
                    h = w/ratio;
                } else {
                    h = size.height;
                }
            } else {
                h = size.width/ratio;

                if (h > size.height) {
                    h = size.height;
                    w = size*ratio;
                } else {
                    w = size.width;
                }
            }

            x = (size.width - w)/2;
            y = (size.height - h)/2;

            this.crop(w, h, x, y)
                .resize(192, 128)
                .stream(ext)
                .pipe(output_stream);
        });

    return promise;
};

function create_pictures(gfs, files) {
    var promise = new mongoose.Promise;
    async.map(
        files,
        function(file, next) {
            create_picture(gfs, file).addBack(next);
        },
        promise.resolve.bind(promise)
    );
    return promise;
};

function delete_picture(gfs, picture) {
    var promise = new mongoose.Promise;
    console.log(inspect(picture));
    async.each(
        _.chain(picture).pick('original', 'thumbnail').values().value(),
        function(id, next) {
            console.log(typeof(id));
            gfs.remove({ _id: id.toString()}, next);
        },
        promise.resolve.bind(promise)
    );
    return promise;
};

function delete_pictures(gfs, pictures) {
    var promise = new mongoose.Promise;
    async.each(
        pictures,
        function(picture, next) {
            delete_picture(gfs, picture).addBack(next);
        },
        promise.resolve.bind(promise)
    );
    return promise;
};

function parse_product_data(req) {
    var promise = new mongoose.Promise;
    var data = {tags:[]};
    var files = [];
    var form = formidableGrid(req.db, mongo, {
        accept: ['image/.*']
    });

    form
        .on('file', function(name, file) {
            if (name === 'pictures') {
                files.push(file);
            }
        })
        .on('field', function(name, value) {
            if (name === 'pictures') {
                files.push(JSON.parse(unescape(value)));
            } else {
                _.extend(data, querystring.parse(name+'='+value));
            }
        })
        .once('error', promise.error.bind(promise))
        .once('end', function() {
            create_pictures(form.gridFs, files)
                .then(function(pictures) {
                    data.pictures = pictures;
                    promise.fulfill(data);
                })
                .then(null, promise.error.bind(promise));
        })
        .parse(req);

    return promise;
};

router
    .route('/')
        .get(function(req, res) {
            Product.find().exec()
                .then(res.send.bind(res))
                .then(null, error.bind(null, res));
        })
        .post(function(req, res) {
            parse_product_data(req)
                .then(function(data) {
                    return Product.create(data);
                })
                .then(res.send.bind(res))
                .then(null, error.bind(null, res));
        });

router
    .param('id', function(req, res, next, id) {
        Product
            .findById(id)
            .exec()
                .then(function(product) {
                    if (product) {
                        req.product = product;
                        req.gridFs = GridFs(req.db, mongo);
                        next();
                    } else {
                        throw _.extend(new Error('Not found'), {status: 404});
                    }
                })
                .then(null, function(err) {
                    res.status(err.status || 500).send(err);
                });
    })
    .route('/:id')
        .get(function(req, res) {res.send(req.product);})
        .put(function(req, res) {
            parse_product_data(req)
                .then(function(data) {
                    // Delete the product pictures which are not present in the
                    // the data pictures
                    delete_pictures(
                        req.gridFs,
                        _.chain(req.product.pictures)
                            .map(function(picture) {
                                var test = function(other) {
                                    return picture.original.equals(other.original);
                                }

                                if (! _.some(data.pictures, test)) {
                                    return picture;
                                }
                            })
                            .compact()
                            .value()
                    );

                    // Update product with data
                    req.product.set(data);
                    req.product.save(function(err, product) {
                        if (err) {
                            console.log(err);
                            error(res, err);
                        } else {
                            res.send(product);
                        }
                    });
                })
                .then(null, error.bind(null, res));
        })
        .delete(function(req, res) {
            delete_pictures(req.gridFs, req.product.pictures)
                .then(function() {
                    return Product.remove({_id: req.product._id}).exec();
                })
                .then(res.sendStatus.bind(res, 200))
                .then(null, error.bind(null, res));
        });

module.exports = router;
