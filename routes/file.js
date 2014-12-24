var express = require('express');
var GridFs = require('gridfs-stream');
var mongo = require('mongodb');

var router = express.Router();

/* GET home page. */
router.get('/:id', function(req, res, next) {
    var gfs = GridFs(req.db, mongo);

    gfs.collection('fs')
        .findOne(
            {_id: new mongo.ObjectID(req.param('id'))},
            function(err, item) {
                if (err) {
                    next(err);
                } else if (! item) {
                    next(Object.create(
                        new Error('File not found'),
                        {status: {value: 404}}
                    ));
                } else {
                    var input_stream = gfs.createReadStream({
                        _id: req.param('id')
                    });
                    input_stream.pipe(res.type('image/jpeg'));
                }
            }
        );
});

module.exports = router;
