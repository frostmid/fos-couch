var _ = require ('lodash'),
	Promises = require ('vow'),
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
			try {
				_.each (this.views.views, function (view) {
					view.notify (event);
				});

				var fetchingPrevious = false;
				if (event.doc.meta && event.doc.meta.prev_rev) {
					var self = this;

					fetchingPrevious = true;

					this.documentRevision (event.id, event.doc.meta.prev_rev)
						.then (function (doc) {
							var previousEvent = _.extend ({}, event, {doc: doc});
							_.each (self.views.views, function (view) {
								view.notify (previousEvent);
							});
						})
						.fail (function (error) {
							console.error ('Could not fetch previous revision', error);
						})
						.done ();
				}
				
				if (this.documents.has (event.id)) {
					Promises.when (this.documents.get (event.id))
						.then (_.bind (function (doc) {
							// TODO: Compare revisions

							var previousEvent = _.extend ({}, event, {doc: doc.data});

							doc.update (event.doc);

							if (!fetchingPrevious) {
								_.each (this.views.views, function (view) {
									view.notify (previousEvent);
								});
							}
						}, this))
						.fail (console.error)
						.done ();
				}
			} catch (e) {
				console.error ('Failed to handle update event', e);
			}
		}
	},

	documentRevision: function (id, rev) {
		return request ({
			url: this.url + encodeURIComponent (id) + '/?rev=' + rev,
			auth: this.server.settings.auth,
			accept: 'application/json'
		});
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
	},

	remove: function (sign) {
		return request ({
			url: this.url,
			method: 'DELETE',
			accept: 'application/json',
			auth: sign.auth,
			oauth: sign.oauth
		});
	}

	/*
	replicate: function () {
		// TODO: Replicate database
	}
	*/
});
