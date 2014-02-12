var _ = require ('lodash'),
	Promises = require ('vow'),
	querystring = require ('querystring'),
	JsonHttpStream = require ('./json-http-stream.js'),

	request = require ('fos-request'),
	Views = require ('./views.js'),
	Documents = require ('./documents.js'),
	mixin = require ('fos-mixin');

module.exports = function (server, name) {
	this.server = server;
	this.name = name;
	this.url = this.server.url + encodeURIComponent (name) + '/';

	this.views = (new Views (this)).lock (this);
	this.documents = (new Documents (this)).lock (this);
	this.stream = null;

	this.lock (this.documents);
	this.lock (this.views);

	this._bulkRead = _.debounce (_.bind (this._bulkRead, this), 50);
	this._bulkReadQueue = {};
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	disposeDelay: 1000,


	_bulkReadQueue: null,
	bulkRead: function (id) {
		if (!this._bulkReadQueue [id]) {
			this._bulkReadQueue [id] = Promises.promise ();
		}

		_.defer (_.bind (this._bulkRead, this));
		
		return this._bulkReadQueue [id];
	},

	_bulkRead: function () {
		var queue = this._bulkReadQueue,
			url = this.url + '_all_docs?include_docs=true',
			self = this;

		if (_.size (queue) == 0) return;

		this._bulkReadQueue = {};

		request ({
			url: url,
			accept: 'application/json',
			method: 'POST',
			
			body: JSON.stringify ({
				keys: _.keys (queue)
			}),

			headers: {
				'content-type': 'application/json; charset=utf-8',
				'accept-encoding': 'gzip, deflate'
			},
			auth: this.server.settings.auth,
			oauth: this.server.settings.oauth
		})
			.then (function (result) {
				_.each (result.rows, function (row) {
					var promise = queue [row.key];
					if (promise) {
						if (row.doc) {
							promise.fulfill (row.doc);
						} else if (row.value) {
							promise.reject ({
								error: 'not_found',
								reason: 'deleted'
							})
						} else {
							promise.reject ({
								error: row.error,
								reason: 'missing'
							});
						}
					} else {
						console.error ('Promise not found', row.key);
					}
				});
			})
			.fail (function (error) {
				console.log ('bulk read got error', self.name, error);
				_.each (queue, function (promise) {
					promise.reject (error);
				});
			})
			.done ();
	},
	
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
			// timeout: 24 * 60 * 60 * 1000,
			include_docs: true,
			feed: 'continuous',
			since: this.info.update_seq
		},

		url = this.url + '_changes?' + querystring.stringify (params);

		(this.stream = new JsonHttpStream (url, this.server.settings.auth))
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

		if (this.views) {
			_.each (this.views.views, function (view) {
				try {
					view.notify (event);
				} catch (e) {
					console.error ('Failed to notify view', view.id, e.message, e.stack);
				}
			});
		}

		if (this.documents && this.documents.has (event.id)) {
			var doc = this.documents.docs [event.id];

			if (!doc.disposing) {
				doc.update (event.doc);
			}
		}

		// trigger event
		if (this.server && this.server.trigger) {
			var eventId = 'urn:fos:trigger/4e2ab2e137480e971c82bdb41d506faf',
				event = {
					data: event.doc,
					originalEvent: event,
					database: this.name
				},
				trigger = this.server.trigger;

			try {
				return Promises.when (trigger (eventId, event))
					.fail (function (error) {
						console.error ('Post-update trigger error', error);
					})
					.done ();
			} catch (e) {
				console.error ('Failed to trigger post-update event', e);
			}
		}
	},

	dispose: function () {
		if (this.stream) {
			this.stream.end ();
		}

		this.server.unset (this.name);

		this.documents.dispose ();
		this.views.dispose ();
		this.cleanup ();
	},

	cleanup: function () {
		this.documents = null;
		this.views = null;
		this.server = null;
		this.stream = null;
	},

	remove: function (sign) {
		return request (_.extend ({
			url: this.url,
			method: 'DELETE',
			accept: 'application/json',
			headers: {
				'accept-encoding': 'gzip, deflate'
			}
		}, sign));
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