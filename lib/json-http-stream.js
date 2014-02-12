var _ = require ('lodash'),
	carrier = require ('carrier'),
	request = require ('fos-request'),
	mixin = require ('fos-mixin'),
	hyperquest = require ('hyperquest');

module.exports = function (url, auth) {
	this.url = url;
	this.auth = auth;
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	fetching: false,
	request: null,

	fetch: function () {
		if (this.fetching) return;
		this.fetching = true;

		this.request = request ({url: this.url, auth: this.auth})
		// this.request = hyperquest (this.url)
			.on ('response', _.bind (function () {
				this.emit ('connect');
			}, this))

			.on ('error', _.bind (function (error) {
				this.emit ('error', error);
			}, this))

			.on ('end', _.bind (function () {
				this.fetching = false;
				this.emit ('end');
			}, this));

		this.request.setEncoding = function () { /* yes, it is dirty */ };

		carrier.carry (this.request, _.bind (function (line) {
			if (!line) return;

			var data;

			try {
				data = JSON.parse (line);
			} catch (e) {
				this.emit ('error', 'Failed to parse update seq ' + e.message + ' in line ' + line);
				return;
			}

			this.emit ('data', data);

			
		}, this));
	},

	end: function () {
		if (this.request) {
			this.request.destroy ();
			this.request = null;
		}
	}
});