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
			headers: {
				'accept-encoding': 'gzip, deflate'
			},
			auth: this.server.settings.auth
		});
	},

	fetched: function (info) {
		this.info = info;
	},

	streaming: false,

	notify: function () {
		if (this.streaming) {
			return;
		}

		this.streaming = true;

		var params = {
			timeout: 10 * 1000,
			include_docs: true,
			feed: 'continuous',
			since: this.info.update_seq
		},

		url = this.url + '_changes?' + querystring.stringify (params);

		(new JsonHttpStream (url, this.server.settings.auth))
			.on ('error', console.error)
			.on ('data', _.bind (function (event) {
				try {
					this.handleEvent (event);
				} catch (e) {
					console.log ('Error while handling db update event', e.message, e.stack);
				}
			}, this))
			.on ('end', _.bind (function () {
				this.streaming = false;
			}, this))
			.fetch ();
	},

	handleEvent: function (event) {
		this.info.update_seq = event.seq || event.last_seq;
		if (!event.doc) return;

		var previousEvent = _.extend ({}, event, {doc: null});

		if (this.documents && this.documents.has (event.id)) {
			var doc = this.documents.docs [event.id];

			previousEvent.doc = doc.data;

			if (!doc.disposing) {
				doc.update (event.doc);
			}
		}

		if (this.views) {
			var notifyViews = _.bind (function (event) {
				_.each (this.views.views, function (view) {
					view.notify (event);
				});
			}, this);

			notifyViews (event);

			if (previousEvent.doc) {
				notifyViews (previousEvent);
			} else {
				var meta = event.doc.meta,
					docPrevRev = meta ? meta.prev_rev : null,
					docLastSeq = meta ? meta.last_update_seq : null,
					promise;

				if (/^1\-/.test (event.doc._rev)) {
					// Document was just created and has no previous versions
				} else {
					if (docPrevRev && (event.seq == docLastSeq - 1)) {
						promise = this.documentOfRevision (event.id, event.doc.meta.prev_rev);
					} else {
						promise = this.documentRevisions (event.id, event.doc._rev);
					}

					promise
						.then (function (data) {
							previousEvent.doc = data;
							notifyViews (previousEvent);
						})
						.fail (function (error) {
							console.error ('Could not fetch previous revision', error, event.id, event.seq);
						})
						.done ();
				}
			}
		} else {
			console.log ('no views');
		}
	},

	documentOfRevision: function (id, rev) {
		return request ({
			url: this.url + encodeURIComponent (id) + '/?rev=' + rev,
			auth: this.server.settings.auth,
			headers: {
				'accept-encoding': 'gzip, deflate'
			},
			accept: 'application/json'
		});
	},

	documentRevisions: function (id, rev) {
		return request ({
			url: this.url + encodeURIComponent (id) + '/?revs=true&rev=' + rev,
			auth: this.server.settings.auth,
			headers: {
				'accept-encoding': 'gzip, deflate'
			},
			accept: 'application/json'
		})
			.then (function (data) {
				var tmp = rev.split ('-'),
					pos = parseInt (tmp [0]),
					revId = tmp [1],
					ids = data._revisions.ids;

				for (var i = 0; i < ids.length; i++) {
					if ((ids [i] == revId) && ids [i + 1]) {
						return (pos - 1) + '-' + ids [i + 1];
					}
				}

				return Promises.reject ('Could not fetch previous revision');
			})
			.then (_.bind (function (rev) {
				return this.documentOfRevision (id, rev);
			}, this));
	},

	dispose: function () {
		this.server.unset (this.name);

		this.documents.dispose ();
		this.views.dispose ();
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
			headers: {
				'accept-encoding': 'gzip, deflate'
			},
			auth: sign.auth,
			oauth: sign.oauth
		});
	},

	replicate: function (options, sign) {
		options.source = this.name;

		return request (_.extend ({
			url: this.server.url + '_replicate',
			method: 'POST',
			body: JSON.stringify (options),
			accept: 'application/json',
			headers: {
				'content-type': 'application/json',
				'accept-encoding': 'gzip, deflate'
			}
		}, sign));
	}
});
