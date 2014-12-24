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
                    url: model.url(),
                    data: form_data,
                    processData: false,
                    contentType: false,
                    type: 'POST',
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
        var list = this.get('pictures');
        if (! _.contains(list, picture)) {
            list.push(picture);
            this.save({pictures: list});
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

app.Products = Backbone.Collection.extend({
    model: app.Product,
    url: '/api/products'
});

app.ProductView = Backbone.View.extend({
    className: 'product',
    template: _.template('#product-template'),
    render: function() {
        this.$(el).empty().html(template(this.model.toJSON()));
        return this;
    }
});

app.ItemView = Backbone.View.extend({
    tagName: 'li',
    template: _.template($('#product-item-template').html()),
    events: {
        'mouseenter': 'onMouseEnter',
        'mouseleave': 'onMouseLeave',
        'click .remove-btn': 'onRemoveButtonClick'
    },
    onMouseEnter: function(e) {
        this.$('.remove-btn').fadeIn();
        return false;
    },
    onMouseLeave: function(e) {
        this.$('.remove-btn').fadeOut();
        return false;
    },
    onRemoveButtonClick: function(e) {
        e.preventDefault();
        this.model.destroy();
        console.log('destroy');
        return false;
    },
    render: function() {
        this.$el.html(this.template(
                _.extend(
                    this.model.toJSON(),
                    {index: _.random(this.model.get('pictures').length - 1)}
                )
            )
        );
        return this;
    }
});

app.ProductsView = Backbone.View.extend({
    el: '#products',
    template: _.template('#products-template'),
    initialize: function() {
        this.listenTo(this.collection, 'reset', this.render);
        this.listenTo(this.collection, 'change', this.render);
        this.listenTo(this.collection, 'destroy', this.render);
        this.collection.fetch({reset: true});
    },
    addProduct: function(product) {
        this.collection.create(product);
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

app.ProductCreator = Backbone.View.extend({
    el: '#product-creator',
    events: {
        'click     input[type=submit]': 'onOkClicked',
        'change    .add-files > input': 'onAddFiles',
        'dragenter #pictures': 'onDragEnter',
        'dragleave #pictures': 'onDragLeave',
        'dragover  #pictures': 'onDragOver',
        'drop      #pictures': 'onDrop',
    },
    initialize: function() {
        $(window).resize(this.onResize.bind(this));
        this.onResize(null);
    },
    onOkClicked: function() {
        this.collection.create({
            name: this.$('#name').val().trim(),
            description: this.$('#desc').val().trim(),
            pictures: _.map(
                this.$('.thumb'),
                function(thumb) {
                    return $(thumb).data('file');
                }
            )
        });

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
    addFile: function(file) {
        // console.log(file);

        var reader = new FileReader;

        reader.onload = (function(e) {
            var img = new Image;
            var pictures = this.$('#pictures');

            img.onload = function() {
                var w = img.width, h = img.height;

                if (w > h) {
                    img.height = 96;
                    img.width  = 96*w/h;
                    $(img).css({
                        left: (96 - img.width)/2
                    });
                } else {
                    img.width  = 96;
                    img.height = 96*h/w;
                    $(img).css({
                        top:  (96 - img.height)/2
                    });
                }

                pictures.append(
                    $(document.createElement('div'))
                        .addClass('thumb')
                        .data('file', file)
                        .append(img)
                );
            };
            img.src = e.target.result;
        }).bind(this);
        reader.readAsDataURL(file);
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
    render: function() {
    },
});

var products = new app.Products;

var productsView = new app.ProductsView({
    collection: products
});
var productCreator = new app.ProductCreator({
    collection: products
})
