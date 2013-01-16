var _ = require ('lodash'),

	mixins = require ('fos-mixins'),
	request = require ('fos-request');


module.exports = function (database, id) {
	this.database = database;
	this.id = id;
	this.url = database.url + encodeURIComponent (id) + '/';
};

mixins (['emitter', 'ready'], module.exports);

_.extend (module.exports.prototype, {
	data: null,

	fetch: function () {
		return request ({
			url: this.url,
			accept: 'application/json'
		});
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

		if (data) this.merge (data);

		if (arguments.length == 1) {
			data = arguments [0];
		} else {
			data = arguments [1];

			url = this.database.url + '_design/' + encodeURIComponent (arguments [0]) +
					'/_update/' + encodeURIComponent (this.data.type) +
					'/' + encodeURIComponent (this.data._id);
		}
		
		return request ({
			url: url,
			accept: 'application/json',
			method: 'PUT',
			body: JSON.stringify (this.data),
			headers: {
				'content-type': 'application/json'
			},
			oauth: this.database.server.settings.oauth	// TODO: This should be passed from client
		});
	},

	attach: function () {
		// TODO: Update attachment
	}
});

