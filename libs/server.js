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
		host: '192.168.1.42',
		port: 5984,
		oauth: {
			consumer_key: "61a712f6c38206b3c78b-1",
			consumer_secret: "29db78b67a412c90e7bf-1",
			token: "personal-2ca6ab4d2f91a8d84087-1",
			token_secret: "0ecc8b3c04d821cc7b6b-1"
		}
	},

	connect: function () {
		console.log ('* Listen for db_update notifications http stream')

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
			this.database (event.db).notify ();
		}
	},

	database: function (name) {
		if (!this.has (name)) {
			this.databases [name] = new Database (this, name);
		}

		return this.databases [name].ready ();
	}
};
