var _ = require ('lodash'),

	mixins = require ('fos-mixins'),
	request = require ('fos-request');


module.exports = function (documents, id) {
	this.documents = documents;
	this.database = documents.database;
	this.id = id;
	this.url = this.database.url + encodeURIComponent (id) + '/';
};

mixins (['emitter', 'ready', 'lock'], module.exports);

_.extend (module.exports.prototype, {
	data: null,

	fetch: function () {
		return request ({
			url: this.url,
			accept: 'application/json',
			auth: this.database.server.settings.auth	// TODO: Reimplement
		});
	},

	fetched: function (data) {
		this.update (data);
	},

	update: function (data) {
		this.data = data;
		this.emit ('change');
	},

	merge: function (data) {
		this.data = _.extend (this.data, data);
	},

	get: function (key) {
		return this.data [key];
	},

	remove: function () {
		return this.save ({
			_deleted: true
		});
	},

	save: function () {
		var designDocId, data,
			url = this.url;

		if (arguments.length == 1) {
			this.merge (arguments [0]);
		} else {
			this.merge (arguments [1]);

			url = this.database.url + '_design/' + encodeURIComponent (arguments [0]) +
					'/_update/' + encodeURIComponent (this.data.type) +
					'/' + encodeURIComponent (this.data._id);
		}

		// this.isReady = false;

		return request ({
			url: url,
			accept: 'application/json',
			method: 'PUT',
			body: JSON.stringify (this.data),
			headers: {
				'content-type': 'application/json'
			},
			auth: this.database.server.settings.auth	// TODO: This should be passed from client
		})
			.then (_.bind (this.returnNotReady, this))
			.then (_.bind (this.ready, this));
	},

	getAttachment: function (name) {
		return request ({
			url: this.url + encodeURIComponent (name),
			auth: this.database.server.settings.auth,
			returnRequest: true
		});
	},

	saveAttachment: function (attachment) {
		return request ({
			url: this.url + encodeURIComponent (attachment.name) + '?rev=' + this.get ('_rev'),
			accept: 'application/json',
			method: 'PUT',
			body: attachment.body,
			headers: {
				'content-type': attachment.contentType
			},
			auth: this.database.server.settings.auth	// TODO: This should be passed from client
		})
			.fail (_.bind (this.returnError, this))
			.then (_.bind (this.returnNotReady, this));
	},

	removeAttachment: function (name) {
		return request ({
			url: this.url + encodeURIComponent (name) + '?rev=' + this.get ('_rev'),
			accept: 'application/json',
			method: 'DELETE',
			auth: this.database.server.settings.auth	// TODO: This should be passed from client
		})
			.fail (_.bind (this.returnError, this))
			.then (_.bind (this.returnNotReady, this));
	},

	release: function () {
		delete this.data;
		this.documents [this.id] = null;
		console.log ('release document', this.id);
	}
});

