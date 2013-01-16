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

	get: function (key) {
		return this.data [key];
	},

	remove: function () {
		// TODO: Remove from database
		/*
		return request ({
			method: 'DELETE',
			url: this.url + '?rev=' + this.get ('_rev'),

		});
		*/
	},

	save: function () {
		// TODO: Save data to database
	},

	attach: function () {
		// TODO: Update attachment
	}
});

