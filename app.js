var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var express = require('express');
var favicon = require('serve-favicon');
var logger = require('morgan');
var mongoose = require('mongoose');
var path = require('path');

var app = null;

function make_application(debug, cb) {
    var cb = cb;
    var debug = debug;

    if (! cb) {
        cb = debug;
        debug = undefined;
    }

    if (! debug) {
        debug = function(){};
    }

    if (typeof(cb) !== 'function') {
        throw Error('callback must be a defined function');
    }

    if (typeof(debug) !== 'function') {
        throw Error('debug must be a function');
    }

    if (! app) {
        mongoose.connect(
            'mongodb://test:test@localhost/test', {db: {native_parser: true}}
        ).connection
            .once('error', cb)
            .once('open', function() {

                debug('Successfully connected to database');

                app = express();

                // view engine setup
                app.set('views', path.join(__dirname, 'views'));
                app.set('view engine', 'jade');

                // uncomment after placing your favicon in /public
                //app.use(favicon(__dirname + '/public/favicon.ico'));
                app.use(logger('dev'));
                app.use(bodyParser.json());
                app.use(bodyParser.urlencoded({ extended: false }));
                app.use(cookieParser());
                app.use(express.static(path.join(__dirname, 'public')));
                app.use(function(req, res, next) {
                    req.db = mongoose.connection.db;
                    next();
                });

                app.use('/', require('routes/index'));
                app.use('/files', require('routes/file'));
                app.use('/api', require('routes/api'));

                // catch 404 and forward to error handler
                app.use(function(req, res, next) {
                    var err = new Error('Not Found');
                    err.status = 404;
                    next(err);
                });

                // error handlers
                app.use(function(err, req, res, next) {
                    res.status(err.status || 500);
                    res.render('error', {
                        message: err.message,
                        error: err
                    });
                });

                make_application(cb);
            }
        );
    } else {
        cb(null, app);
    }
}

module.exports = make_application;
