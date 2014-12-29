$.event.props.push('dataTransfer');

var app = app || {};

syncProduct = function(method, model, options) {
    console.log(method, model, options);

    switch (method.toLowerCase()) {
    case 'create':
    case 'update':
    case 'patch':
        return (function() {
            var data = model.attributes;
            var form_data = new FormData;

            _.chain(data)
                .pick('name', 'description', 'published')
                .each(function(value, attr) {
                    form_data.append(
                        attr,
                        attr === 'tags'
                            ? escape(JSON.stringify(value))
                            : value
                    )
                });
            _.each(data.pictures, function(picture) {
                form_data.append(
                    'pictures',
                    picture.file instanceof File
                        ? picture.file
                        : JSON.stringify(picture)
                );
            });

            var params = _.extend(
                {
                    data: form_data,
                    contentType: false,
                    processData: false,
                    type: method === 'create' ? 'POST':'PUT',
                    url: options.url || model.url(),
                },
                options
            );

            var xhr = Backbone.ajax(params);

            model.trigger('request', model, xhr, options);

            return xhr;
        })();
        break;

    default:
        return Backbone.sync.call(this, method, model, options);
    }
};

app.Product = Backbone.Model.extend({
    idAttribute: '_id',
    defaults: {
        published: false,
        pictures: [],
        tags: [],
    },
    publish: function() {
        this.save({published: true});
    },
    unpublish: function() {
        this.save({published: false});
    },
    addPicture: function(picture) {
        var list = this.get('pictures').slice(0);
        if (! _.contains(list, picture)) {
            var index = list.length;
            if (picture instanceof File) {
                picture = {file: picture};
            }
            list.push(picture);
            this.set({pictures: list});
            this.trigger('new-picture', picture, index);
            return list[index];
        }
    },
    removePictureAtIndex: function(index) {
        var list = this.get('pictures').slice(0);
        if (index < list.length) {
            var picture = (list.splice(index, 1))[0];
            this.set({pictures: list});
            return true;
        }
        return false;
    },
    validate: function(attributes, options) {
        var isValidPicture = function(picture) {
            return picture.file instanceof File
                    || (picture.original && picture.thumbnail);
        };

        if (! attributes.name instanceof String) {
            return new Error('name must be a String');
        }
        if (! attributes.description instanceof String) {
            return new Error('description mus be a String');
        }
        if (! (attributes.pictures instanceof Array
                && _.every(attributes.pictures, isValidPicture))) {
            return new Error('pictures must be a non empty Array of valid pictures');
        }
        if (! (attributes.tags instanceof Array
                && _.every(attributes.tags, _.isString))) {
            return new Error('tags must be an Array of String');
        }
    },
    sync: syncProduct.bind(this)
});

app.Products = Backbone.Collection.extend({
    model: app.Product,
    url: '/api/products'
});

app.Thumbnail = Backbone.Model.extend({
    setPicture: function(picture) {
        this.unset('original',  {silent: true});
        this.unset('thumbnail', {silent: true});
        this.unset('file',      {silent: true});
        this.set(picture);
    },
    validate: function(attributes) {
        if (! (attributes.file instanceof File)
                || (attributes.thumbnail instanceof String
                        && attributes.original instanceof String)) {
            return new Error('invalid thumbnail data')
        }
    }
});

app.ThumbnailView = Backbone.View.extend({
    className: 'thumb',
    events: {
        'click .action-bar > a': 'onActionRequested',
        'mouseenter': 'onMouseEnter',
        'mouseleave': 'onMouseLeave'
    },
    initialize: function() {
        this.options = {
            removable: true,
            editable: true,
            side: 128,
        };
    },
    configure: function(options) {
        _.extend(
            this.options,
            _.pick(options || {}, 'removable', 'editable', 'side')
        );
        return this;
    },
    onActionRequested: function(e) {
        e.preventDefault();
        this.trigger($(e.currentTarget).attr('data-action'), this.model);
        return false;
    },
    onMouseEnter: function(e) {
        this.$('.action-bar').fadeIn(100);
        return false;
    },
    onMouseLeave: function(e) {
        this.$('.action-bar').fadeOut(100);
        return false;
    },
    render: function() {
        var side = this.options.side;

        var createSpinner = (function() {
            var fontSize = side/4;
            var shift = 3*fontSize/2;

            return $(document.createElement('i'))
                .addClass('fa fa-circle-o-notch fa-spin')
                .css({
                    position: 'absolute',
                    fontSize: fontSize,
                    height: fontSize,
                    width: fontSize,
                    left: shift,
                    top:  shift
                });
        }).bind(this);

        var createPlaceholder = (function() {
            var fontSize = side - 32;
            var shift = (side - fontSize)/2;

            return $(document.createElement('i'))
                .addClass('fa fa-ban fa-fw')
                .css({
                    color: 'lightgray',
                    position: 'absolute',
                    fontSize: fontSize,
                    height: fontSize,
                    width: fontSize,
                    left: shift,
                    top:  shift
                });
        }).bind(this);

        var createActionBar = (function() {
            var actions = [];

            if (this.options.removable) {
                actions.push(
                    $(document.createElement('a'))
                    .attr('href', '#')
                    .attr('data-action', 'remove')
                    .append($(document.createElement('i')).addClass('fa fa-trash'))
                );
            }

            if (this.options.editable) {
                actions.push(
                    $(document.createElement('a'))
                    .attr('href', '#')
                    .attr('data-action', 'edit')
                    .append($(document.createElement('i')).addClass('fa fa-pencil'))
                );
            }

            return $(document.createElement('div')).addClass('action-bar').append(actions);
        }).bind(this);

        var createThumb = (function(cb) {
            if (! this.model) {
                var elt = createPlaceholder();
                if (cb) {
                    cb.call(this, elt);
                }
                return elt;
            }

            this.$el.append(createSpinner());

            var view = this;
            var data = this.model.toJSON();
            var img = new Image;

            img.onload = function() {
                var w = img.width, h = img.height, r = w/h;

                if (r > 1) {
                    w = side*r;
                    $(img).css({
                        left: (side - w)/2,
                        width: w,
                        height: side
                    });
                } else {
                    h = side/r;
                    $(img).css({
                        top: (side - h)/2,
                        width: side,
                        height: h
                    });
                }

                if (cb) {
                    cb.call(view, $(img));
                }
            };

            if (data.file instanceof File) {
                var reader = new FileReader;
                reader.onload = (function(e) {
                    img.src = e.target.result;
                });
                reader.readAsDataURL(data.file);
            } else {
                img.src = 'files/' + data.thumbnail;
            }

            return $(img);
        }).bind(this);

        this.$el.empty();
        this.$el.css({width: side, height: side});

        createThumb(function(thumb) {
            this.$('i').remove();
            this.$el
                .append(thumb)
                .append(createActionBar());
        });

        return this;
    }
});

app.ItemView = Backbone.View.extend({
    tagName: 'li',
    initialize: function() {
        this.listenTo(this.model, 'change', this.render);
    },
    render: function() {
        var pictures = this.model.get('pictures');
        var thumb_view = new app.ThumbnailView({
            model: pictures.length > 0 ? new app.Thumbnail(pictures[0]) : null
        });

        this.stopListening();
        this.listenTo(thumb_view, 'remove', function() {
            this.model.destroy();
            thumb_view.remove();
        });
        this.listenTo(thumb_view, 'edit', function() {
            productCreator.setModel(this.model);
        });
        this.$el.append(thumb_view.render().el);

        return this;
    }
});

app.ProductsView = Backbone.View.extend({
    el: '#products',
    initialize: function() {
        this.listenTo(this.collection, 'reset', this.render);
        this.listenTo(this.collection, 'add', this.renderProduct);
        this.collection.fetch({reset: true});
    },
    renderProduct: function(product) {
        var item_view = new app.ItemView({
            model: product
        });
        this.$el.append(item_view.render().el);
    },
    render: function() {
        this.$el.empty();
        this.collection.each(this.renderProduct.bind(this));
    },
    sync: syncProduct.bind(this)
});

app.ProductPictureListView = Backbone.View.extend({
    tagName: 'ul',
    className: 'thumbnails',
    events: {
        'dragenter':     'onDragEnter',
        'dragleave':     'onDragLeave',
        'dragover':      'onDragOver',
        'drop':          'onDrop'
    },
    initialize: function() {
        this.options = {
            side: 128,
        };
        this.listenTo(this.model, 'new-picture', this.onNewPicture);
    },
    configure: function(options) {
        _.extend(
            this.options,
            _.pick(options || {}, 'removable', 'editable', 'side')
        );
        return this;
    },
    resize: function() {
        var w = Math.floor(this.$el.get(0).getBoundingClientRect().width);
        var thumb_width = this.options.side + 4;
        var n = Math.floor(w/thumb_width);
        this.$el.css({
            padding: '0 ' + Math.floor((w - n*thumb_width)/2) + 'px',
        });
        return this;
    },
    onDragEnter: function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.$el.attr('data-state', 'over');
        this.onResize(null);
        return false;
    },
    onDragLeave: function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.$el.removeAttr('data-state');
        return false;
    },
    onDragOver: function(e) {
        e.dataTransfer.dropEffect = 'copy';
        e.preventDefault();
        e.stopPropagation();
        return false;
    },
    onDrop: function(e) {
        this.onDragLeave.call(this, e);
        this.addFiles(e.dataTransfer.files);
        return false;
    },
    addFiles: function(files) {
        _.each(files, this.addFile, this);
    },
    addFile: function(file) {
        this.model.addPicture(file);
    },
    addPictures: function(pictures) {
        _.each(pictures, this.onNewPicture, this);
    },
    onNewPicture: function(picture, index) {
        var thumb_view = new app.ThumbnailView({
            model: new app.Thumbnail(picture)
        });

        this.listenTo(
            thumb_view, 'remove',
            function() {
                this.stopListening(thumb_view);
                this.model.removePictureAtIndex(index);
                thumb_view.remove();
                this.$el.children().slice(index, index + 1).remove();
            }
        );
        this.$el.append(
            $(document.createElement('li'))
                .append(thumb_view.configure({editable: false}).render().el)
        );
    },
    render: function() {
        this.addPictures(this.model.get('pictures'));
        return this;
    }
});

app.ProductCreator = Backbone.View.extend({
    el: '#product-creator',
    events: {
        'blur   #name': 'onNameChanged',
        'blur   #desc': 'onDescriptionChanged',
        'change .add-files > input': 'onAddPictures',
        'click  input[type=submit]': 'onOkClicked',
    },
    initialize: function() {
        this.reset();
    },
    setModel: function(model) {
        if (this.model) {
            this.stopListening(this.model);
        }
        this.model = model || new app.Product;
        this.listenTo(this.model, 'destroy', this.reset);
        this.render();
    },
    reset: function() {
        this.setModel();
    },
    onOkClicked: function() {
        if (this.model.isNew()) {
            this.model.save(null, {
                url: this.collection.url,
                success: this.collection.add.bind(this.collection, this.model)
            });
        } else {
            this.model.save();
        }
        return false;
    },
    onResize: function() {
        this.pictureListView.resize();
    },
    onAddPictures: function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.pictureListView.addFiles(e.target.files);
        return false;
    },
    onRemovePicture: function(index) {
        this.model.removePictureAtIndex(index);
    },
    onNameChanged: function() {
        this.model.set('name', this.$('#name').val().trim());
        return false;
    },
    onDescriptionChanged: function() {
        this.model.set('description', this.$('#desc').val());
        return false;
    },
    render: function() {
        if (this.pictureListView) {
            this.pictureListView.stopListening();
            this.pictureListView.remove();
        }
        this.pictureListView = new app.ProductPictureListView({
            model: this.model
        });
        this.$('#pictures').append(this.pictureListView.render().el);
        this.$('#desc').val(this.model.get('description'));
        this.$('#name').val(this.model.get('name'));
        this.onResize();

        $(window).resize(this.onResize.bind(this));
    },
});

var products = new app.Products;

var productsView = new app.ProductsView({
    collection: products
});
var productCreator = new app.ProductCreator({
    collection: products
})
