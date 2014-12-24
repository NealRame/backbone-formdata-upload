var _ = require('underscore');
var async = require('async');
var express = require('express');
var formidableGrid = require('formidable-grid');
var gm = require('gm');
var mongo = require('mongodb');
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

function handle_file(gfs, file, next) {
    if (! file.name) {
        return next(null, file);
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
        .once('error', next)
        .once('close', next.bind(null, null, {
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
};

function create_product(req, res) {
    var pictures = [];
    var product = {};
    var form = formidableGrid(req.db, mongo, {
        accept: ['image/.*']
    });

    form
        .on('file', function(name, file) {
            pictures.push(file);
        })
        .on('field', function(name, value) {
            if (name === 'pictures') {
                var data = unescape(value);

                pictures.push(JSON.parse(data));
            } else {
                _.extend(product, querystring.parse(name+'='+value));
            }
        })
        .once('error', error.bind(null, res))
        .once('end', function() {
            async.map(
                pictures,
                handle_file.bind(null, form.gridFs),
                function(err, pictures) {

                    console.log('-- error   : ' + inspect(err));
                    console.log('-- pictures: ' + inspect(pictures));

                    if (err) {
                        error(res, err);
                    } else {
                        Product.create(_.extend(product, {pictures: pictures}))
                            .then(function(product) {
                                res.send(product);
                            })
                            .then(null, error.bind(null, res));
                    }
                }
            );
        });

    form.parse(req);
};

router
    .route('/')
        .get(function(req, res) {
            Product.find().exec()
                .then(res.send.bind(res))
                .then(null, error.bind(null, res));
        })
        .post(create_product);

router
    .route('/:id')
        .get(function(req, res) {
            error(res, new Error('Not implemented'));
        })
        .put(function(req, res) {
            error(res, new Error('Not implemented'));
        })
        .delete(function(req, res) {
            error(res, new Error('Not implemented'));
        });

module.exports = router;
