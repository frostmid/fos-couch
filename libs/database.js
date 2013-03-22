var _ = require ('lodash'),
	Q = require ('q'),
	querystring = require ('querystring'),

	JsonHttpStream = require ('fos-json-http-stream'),
	mixin = require ('fos-mixin'),
	request = require ('fos-request'),

	Views = require ('./views'),
	Documents = require ('./documents');


module.exports = function (server, name) {
	this.server = server;
	this.name = name;
	this.url = this.server.url + encodeURIComponent (name) + '/';

	this.views = (new Views (this)).lock (this);
	this.documents = (new Documents (this)).lock (this);
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	disposeDelay: 1000,
	
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

		(new JsonHttpStream (url, this.server.settings.auth))
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
			// console.log ('handle event', event);
			try {
				if (this.documents.has (event.id)) {
					Q.when (this.documents.get (event.id))
						.then (_.bind (function (doc) {
							var previousEvent = _.extend ({}, event, {doc: doc.data});

							_.each (this.views.views, function (view) {
								view.notify (previousEvent);
								view.notify (event);
							});

							doc.update (event.doc);
						}, this))
						.fail (console.error)
						.done ();
				} else {
					console.log ('missing document', event.id);
					_.each (this.views.views, function (view) {
						view.notify (event);
					});
				}
			} catch (e) {
				console.error (e);
			}
			
			_.each (this.views.views, function (view) {
				// TODO: Fetch previous element
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
