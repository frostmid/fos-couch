var Q = require ('q'),
	_ = require ('lodash'),

	JsonHttpStream = require ('fos-json-http-stream'),
	mixin = require ('fos-mixin'),
	request = require ('fos-request')

	Database = require ('./database');


function url (settings) {
	return (settings.secure ? 'https' : 'http') + '://' + settings.host + ':' + settings.port + '/';
}


module.exports = function (settings) {
	this.settings = _.extend ({}, this.settings, settings);
	this.url = url (this.settings);
	
	this.databases = [];
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	tag: 'server',

	settings: {
		secure: false,
		host: 'localhost',
		port: 5984
	},

	fetch: function () {
		return this.settings.notifications;
	},

	fetched: function (settings) {
		return this.stream (settings);
	},

	stream: function (settings) {
		var url = 'http://' + this.settings.host + ':' + settings.port + '/';

		var restart = _.bind (function () {
			this.stream (settings);
		}, this);

		var deferred = Q.defer ();

		(this.updates = new JsonHttpStream (url))
			.on ('connect', _.bind (function () {
				deferred.resolve (this);
			}, this))

			.on ('error', function (error) {
				console.error ('Updates stream error', error);
				deferred.reject (error);
			})
			
			.on ('data', _.bind (this.notify, this))

			.on ('end', function () {
				_.delay (restart, 1000);
			})
			.fetch ();

		return deferred.promise;
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
	},

	unset: function (name) {
		delete this.databases [name];
	}
});
