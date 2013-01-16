var _ = require ('lodash'),
	querystring = require ('querystring'),

	JsonHttpStream = require ('fos-json-http-stream'),
	mixins = require ('fos-mixins'),
	request = require ('fos-request'),

	Views = require ('./views'),
	Documents = require ('./documents');;


module.exports = function (server, name) {
	this.server = server;
	this.name = name;
	this.url = this.server.url + encodeURIComponent (name) + '/';

	this.views = new Views (this);
	this.documents = new Documents (this);
};

mixins (['ready'], module.exports);

_.extend (module.exports.prototype, {
	fetch: function () {
		return request ({
			url: this.url,
			accept: 'application/json'
		});
	},

	update: function (info) {
		this.info = info;
	},

	streaming: false,

	notify: function () {
		if (this.streaming) return;
		this.streaming = true;

		var params = {
			timeout: 3 * 1000,
			include_docs: true,
			feed: 'continuous',
			since: this.info.update_seq
		},

		url = this.url + '_changes?' + querystring.stringify (params);

		(new JsonHttpStream (url))
			.on ('error', console.error)
			.on ('data', _.bind (this.handleEvent, this))
			.on ('end', _.bind (function () {
				this.streaming = false;
			}, this))
			.fetch ();
	},

	handleEvent: function (event) {
		this.info.update_seq = event.seq || event.last_seq;

		if (event.doc) {
			if (this.documents.has (event.id)) {
				this.documents.get (event.id).update (event.doc);
			}

			_.each (this.views.views, function (view) {
				view.notify (event);
			});
		}
	}
});
