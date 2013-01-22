var Q = require ('q'),
	_ = require ('lodash'),

	JsonHttpStream = require ('fos-json-http-stream'),
	mixins = require ('fos-mixins'),
	request = require ('fos-request')

	Database = require ('./database');


function url (settings) {
	return (settings.secure ? 'https' : 'http') + '://' + settings.host + ':' + settings.port + '/';
}


module.exports = function (settings) {
	this.settings = _.extend ({}, this.settings, settings);
	this.url = url (this.settings);
	
	this.databases = {};
};

mixins (['ready'], module.exports);

_.extend (module.exports.prototype, {
	settings: {
		secure: false,
		host: 'localhost',
		port: 5984
	},

	fetch: function () {
		return request ({
			url: this.url + '_config/http-notifications',
			auth: this.settings.auth,
			accept: 'application/json'
		});
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

			.on ('error', deferred.reject)
			
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
