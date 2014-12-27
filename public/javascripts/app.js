$.event.props.push('dataTransfer');

var app = app || {};

syncProduct = function(method, model, options) {
    switch (method.toLowerCase()) {
    case 'create':
        return (function() {
            var form_data = new FormData;
            var data = model.toJSON();

            if (data.name) {
                form_data.append('name', data.name);
            }

            if (data.description) {
                form_data.append('description', data.description);
            }

            if (data.pictures) {
                _.each(data.pictures, function(picture) {

                    form_data.append(
                        'pictures',
                        picture instanceof File
                            ? picture
                            : escape(JSON.stringify(picture))
                    );
                });
            }

            var params = _.extend(
                {
                    data: form_data,
                    contentType: false,
                    processData: false,
                    type: 'POST',
                    url: options.url || model.url(),
                },
                options
            );
            var xhr = Backbone.ajax(params);

            model.trigger('request', model, xhr, options);

            return xhr;
        })();
        break;

    case 'update':
    case 'patch':
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
            list.push(picture);
            this.set({pictures: list});
        }
    },
    validate: function(attributes, options) {
        var isValidPicture = function(picture) {
            return picture instanceof File
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
            return new Error('pictures must be an Array of valid pictures');
        }

        if (! (attributes.tags instanceof Array
                && _.every(attributes.tags, _.isString))) {
            return new Error('tags must be an Array of String');
        }
    },
    sync: syncProduct.bind(this)
});

app.Thumbnail = Backbone.Model.extend({
    setPicture: function(picture) {
        this.unset('original',  {silent: true});
        this.unset('thumbnail', {silent: true});
        this.unset('file',      {silent: true});
        this.set(
            picture instanceof File
                ? {file: picture}
                : _.pick(picture, 'original', 'thumbnail')
        );
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
    },
    onActionRequested: function(e) {
        e.preventDefault();
        this.trigger($(e.target).attr('data-action'), this.model);
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
    createThumb: function() {
        var data = this.model.toJSON();
        var img = new Image;
        var side = this.options.side;

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
    },
    createActionBar: function() {
        var actions = [];

        if (this.options.removable) {
            actions.push(
                $(document.createElement('a'))
                    .addClass('remove-btn')
                    .attr('href', '#')
                    .attr('data-action', 'remove')
            );
        }

        if (this.options.editable) {
            actions.push(
                $(document.createElement('a'))
                    .addClass('edit-btn')
                    .attr('href', '#')
                    .attr('data-action', 'edit')
            );
        }

        return $(document.createElement('div')).addClass('action-bar').append(actions);
    },
    render: function() {
        var side = this.options.side;
        this.$el.empty();
        this.$el
            .css({width:  side, height: side})
            .append(this.createThumb())
            .append(this.createActionBar());
        return this;
    }
});

app.Products = Backbone.Collection.extend({
    model: app.Product,
    url: '/api/products'
});

app.ItemView = Backbone.View.extend({
    tagName: 'li',
    initialize: function() {
        this.listenTo(this.model, 'change', this.render);
    },
    render: function() {
        this.stopListening();

        var thumb = new app.Thumbnail;
        var thumb_view = new app.ThumbnailView({
            model: thumb
        });

        thumb.setPicture(this.model.get('pictures')[0]);

        this.listenTo(thumb_view, 'remove', function() {
            this.model.destroy();
            thumb_view.remove();
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
    events: {
        'dragenter': 'onDragEnter',
        'dragleave': 'onDragLeave',
        'dragover':  'onDragOver',
        'drop':      'onDrop',
    },
    onDragEnter: function(e) {
        // console.log(e, 'enter');

        e.preventDefault();
        e.stopPropagation();

        this.$el.attr('data-state', 'over');
        this.onResize(null);

        return false;
    },
    onDragLeave: function(e) {
        // console.log(e, 'leave');

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
        // console.log(e, 'drop');

        this.onDragLeave.call(this, e);
        this.trigger('add-pictures', e.dataTransfer.files);

        return false;
    },
    render: function() {
        _.each(
            this.model.get('pictures'),
            function(picture, index) {
                var thumb = new app.Thumbnail;
                var thumb_view = new app.ThumbnailView({
                    model: thumb
                });

                thumb.setPicture(picture);
                thumb_view.configure({editable: false});

                this.listenTo(thumb_view, 'remove', function() {
                    this.trigger('remove-picture', index);
                });
                this.$el.append(thumb_view.render().el);
            },
            this
        );
    }
});

app.ProductCreator = Backbone.View.extend({
    el: '#product-creator',
    events: {
        'click     input[type=submit]': 'onOkClicked',
        'change    .add-files > input': 'onAddFiles',
        'dragenter #pictures': 'onDragEnter',
        'dragleave #pictures': 'onDragLeave',
        'dragover  #pictures': 'onDragOver',
        'drop      #pictures': 'onDrop',
        'blur      #name': 'onNameChanged',
        'blur      #desc': 'onDescriptionChanged'
    },
    initialize: function() {
        $(window).resize(this.onResize.bind(this));
        this.onResize(null);
        this.reset();
    },
    setModel: function(model) {
        if (this.model) {
            this.stopListening(this.model);
        }
        this.model = model || new app.Product;
        this.listenTo(this.model, 'destroy', this.reset);
        this.listenTo(this.model, 'change:pictures', this.render);
    },
    reset: function() {
        this.setModel();
        this.render();
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
    onResize: function(e) {
        var pictures = this.$('#pictures');
        var w = Math.floor(pictures.get(0).getBoundingClientRect().width);
        var n = Math.floor(w/(96 + 4));

        pictures.css({
            padding: '0 ' + Math.floor((w - n*(96 + 4))/2) + 'px',
        });
        return false;
    },
    onAddFiles: function(e) {
        e.preventDefault();
        e.stopPropagation();

        _.each(e.target.files, this.addFile, this);

        return false;
    },
    onDragEnter: function(e) {
        // console.log(e, 'enter');

        e.preventDefault();
        e.stopPropagation();

        this.$('#pictures').attr('data-state', 'over');
        this.onResize(null);

        return false;
    },
    onDragLeave: function(e) {
        // console.log(e, 'leave');

        e.preventDefault();
        e.stopPropagation();

        this.$('#pictures').removeAttr('data-state');

        return false;
    },
    onDragOver: function(e) {
        e.dataTransfer.dropEffect = 'copy';
        e.preventDefault();
        e.stopPropagation();

        return false;
    },
    onDrop: function(e) {
        // console.log(e, 'drop');

        this.onDragLeave.call(this, e);
        _.each(e.dataTransfer.files, this.addFile, this);

        return false;
    },
    onNameChanged: function() {
        this.model.set('name', this.$('#name').val().trim());
        return false;
    },
    onDescriptionChanged: function() {
        this.model.set('description', this.$('#desc').val());
        return false;
    },
    addFile: function(file) {
        this.model.addPicture(file);
    },
    render: function() {
        var pictures = this.$('#pictures');
        var create_thumb = function(source) {

            var thumb =
                $(document.createElement('div'))
                    .addClass('thumb')
                    .css({width: 128, height: 128});

            var edit_bar =
                $(document.createElement('div'))
                    .addClass('edit-bar')
                    .html('<a class="remove-btn" href="#"></a>');

            pictures.append(thumb);

            var img = new Image;
            img.onload = function() {
                var w = img.width, h = img.height, r = w/h;

                if (r > 1) {
                    w = 128*r;
                    $(img).css({
                        left: (128 - w)/2,
                        width: w,
                        height: 128
                    });
                } else {
                    h = 128/r;
                    $(img).css({
                        top: (128 - h)/2,
                        width: 128,
                        height: h
                    });
                }

                thumb.append([img, edit_bar]);
            };

            if (source instanceof File) {
                var reader = new FileReader;

                reader.onload = (function(e) {
                    img.src = e.target.result;
                });
                reader.readAsDataURL(source);
            } else {
                img.src = 'files/' + source.thumbnail;
            }
        };

        pictures.empty();

        if (this.model) {
            this.$('#desc').val(this.model.get('description'));
            this.$('#name').val(this.model.get('name'));
            _.each(this.model.get('pictures'), create_thumb);
        } else {
            this.$('#desc').val('');
            this.$('#name').val('');
        }
    },
});

var products = new app.Products;

var productsView = new app.ProductsView({
    collection: products
});
var productCreator = new app.ProductCreator({
    collection: products
})
