var _ = require ('lodash'),
	Q = require ('q'),
	querystring = require ('querystring'),

	JsonHttpStream = require ('fos-json-http-stream'),
	mixins = require ('fos-mixins'),
	request = require ('fos-request'),

	Views = require ('./views'),
	Documents = require ('./documents');


module.exports = function (server, name) {
	this.id = 'database #' + name;
	this.server = server;
	this.name = name;
	this.url = this.server.url + encodeURIComponent (name) + '/';

	this.views = (new Views (this)).lock (this);
	this.documents = (new Documents (this)).lock (this);
};

mixins (['ready', 'lock'], module.exports);

_.extend (module.exports.prototype, {
	fetch: function () {
		return request ({
			url: this.url,
			accept: 'application/json',
			auth: this.server.settings.auth
		});
	},

	fetched: function (info) {
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
				Q.when (this.documents.get (event.id))
					.then (function (doc) {
						doc.update (event.doc);
					})
					.fail (console.error)
					.done ();
			}

			_.each (this.views.views, function (view) {
				view.notify (event);
			});
		}
	},

	dispose: function () {
		this.server.unset (this.name);

		this.documents.cleanup ();
		this.views.cleanup ();
		this.cleanup ();
	},

	cleanup: function () {
		this.documents = null;
		this.views = null;
		this.server = null;
	}
});
