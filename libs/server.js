var Q = require ('q'),
	_ = require ('lodash'),

	JsonHttpStream = require ('fos-json-http-stream'),
	request = require ('fos-request')

	Database = require ('./database');


function url (settings) {
	return (settings.secure ? 'https' : 'http') + '://' + settings.host + ':' + settings.port + '/';
}


module.exports = function (settings) {
	this.settings = _.extend ({}, this.settings, settings);
	this.url = url (this.settings);
	
	this.databases = {};
	this.connect ();
};

module.exports.prototype = {
	settings: {
		secure: false,
		host: 'localhost',
		port: 5984,
		oauth: null
	},

	connect: function () {
		// console.log ('* Listen for db_update notifications http stream')

		request ({
			url: this.url + '_config/http-notifications',
			oauth: this.settings.oauth,
			accept: 'application/json'
		})
			.then (_.bind (this.stream, this))
			.fail (console.error)
			.done ();
	},

	stream: function (settings) {
		var url = 'http://' + this.settings.host + ':' + settings.port + '/';
		(this.updates = new JsonHttpStream (url))
			.on ('error', console.error)
			.on ('data', _.bind (this.notify, this))
			.on ('end', _.bind (this.connect, this))
			.fetch ();
	},

	has: function (name) {
		return this.databases [name] != undefined;
	},

	notify: function (event) {
		if (this.has (event.db)) {
			Q.when (this.database (event.db))
				.then (function (database) {
					database.notify ();
				})
				.fail (console.error)
				.done ();
		}
	},

	database: function (name) {
		if (!this.has (name)) {
			this.databases [name] = new Database (this, name);
		}

		return this.databases [name].ready ();
	}
};
