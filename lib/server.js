var _ = require ('lodash'),
	Promises = require ('vow'),
	Database = require ('./database.js'),
	request = require ('fos-request'),
	carrier = require ('carrier'),
	mixin = require ('fos-mixin');

function env () {
	return {
		type: (typeof process == 'object') ? 'server' : 'browser',
		engine: 'nodejs',
		process: (typeof process == 'undefined' ? null : process)
	};
}

function url (settings) {
	return (settings.secure ? 'https' : 'http') + '://' + settings.host + ':' + settings.port + '/';
}

module.exports = function (settings) {
	this.settings = _.extend ({}, this.settings, settings);
	this.url = url (this.settings);
	
	this.databases = {};
	this.trigger = null;
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	settings: {
		secure: false,
		host: 'localhost',
		port: 5984
	},

	fetch: function () {
		return null;
	},

	fetched: function () {
		this.stream ();
	},

	stream: function (settings) {
		var self = this;

		env.process.stdin.resume ();
		carrier.carry (env.process.stdin, function (line) {
			if (line) {
				try {
					self.notify (
						JSON.parse (line)
					);
				} catch (e) {
					console.error ('Could not parse stdin', e.message, line);
				}
			}
		});
	},

	has: function (name) {
		return this.databases [name] != undefined;
	},

	notify: function (event) {
		if (this.has (event.db)) {
			Promises.when (this.database (event.db))
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
	},

	uuids: function (count) {
		count = count || 1;

		return request ({
			url: this.url + '_uuids?count=' + count,
			accept: 'application/json',
			headers: {
				'accept-encoding': 'gzip, deflate'
			}
		})
			.then (function (result) {
				return result.uuids;
			});
	},

	uuid: function () {
		return this.uuids ()
			.then (function (uuids) {
				return uuids [0];
			});
	},

	create: function (name, sign) {
		var self = this;

		return request ({
			url: this.url + encodeURIComponent (name),
			method: 'PUT',
			accept: 'application/json',
			headers: {
				'accept-encoding': 'gzip, deflate'
			},
			auth: sign.auth,
			oauth: sign.oauth
		})
			.then (function (result) {
				return self.database (name);
			})
			.fail (function (error) {
				if (error.error == 'file_exists') {
					return self.database (name);
				} else {
					return Promises.reject (error);
				}
			});
	}
});