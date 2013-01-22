var _ = require ('lodash'),
	Document = require ('./document'),

	request = require ('fos-request'),
	mixins = require ('fos-mixins');


module.exports = function (database) {
	this.database = database.lock (this);
	this.docs = {};
};

mixins (['lock'], module.exports);

_.extend (module.exports.prototype, {
	get: function (id) {
		if (!this.has (id)) {
			this.docs [id] = new Document (this, id);
		}

		return this.docs [id].ready ();
	},

	unset: function (id) {
		// console.log ('delete doc', id, 'from docs');
		delete this.docs [id];
	},

	create: function () {
		var designDocId, data,
			url = this.database.url;

		if (arguments.length == 1) {
			data = arguments [0];
		} else {
			data = arguments [1];

			url +=	'_design/' + encodeURIComponent (arguments [0]) +
					'/_update/' + encodeURIComponent (data.type);
		}

		return request ({
			url: url,
			method: 'POST',
			body: JSON.stringify (data),
			accept: 'application/json',
			headers: {
				'content-type': 'application/json'
			},
			auth: this.database.server.settings.auth	// TODO: Bypass client authorization tokens
		})
			.then (_.bind (function (resp) {
				return this.get (resp.id);
				
			}, this))
	},

	has: function (id) {
		return this.docs [id] != undefined;
	},

	dispose: function () {
		// console.log ('dispose documents');
		this.disposing = null;
		this.database.release (this, true);
	},

	cleanup: function () {
		this.database = null;
		this.docs = null;
	}
});
