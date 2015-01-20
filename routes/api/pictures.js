var _ = require('underscore');
var async = require('async');
var express = require('express');
var formidableGrid = require('formidable-grid');
var GridFs = require('gridfs-stream');
var mongo = require('mongodb');
var mongoose = require('mongoose');
var path = require('path');
var Picture = require('models/picture');

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

function parse_picture_data(req) {
    var promise = new mongoose.Promise;
    var files = [];
    var form = formidableGrid(req.db, mongo, {
        accept: ['image/.*']
    });

    console.log('-- ', inspect(form));

    form.multiples = false;
    form.maxFields = 1;

    console.log('-- ', inspect(form));

    form
        .on('file', function(name, file) {
            files.push(file);
        })
        .once('error', promise.error.bind(promise))
        .once('end', function() {
            promise.fulfill(files[0]);
        })
        .parse(req);

    return promise;
};

router
    .route('/')
        .get(function(req, res) {
            Picture.find().exec()
                .then(res.send.bind(res))
                .then(null, error.bind(null, res));
        })
        .post(function(req, res) {
            parse_picture_data(req)
                .then(function(data) {
                    console.log(inspect(data));
                    return Picture.create(data);
                })
                .then(res.send.bind(res))
                .then(null, error.bind(null, res));
        });

router
    .param('id', function(req, res, next, id) {
        Picture
            .findById(id)
            .exec()
            .then(function(picture) {
                if (picture) {
                    req.picture = picture;
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
        .get(function(req, res) {res.send(req.picture);})
        .delete(function(req, res) {
            res.sendStatus(501);
        });

module.exports = router;
