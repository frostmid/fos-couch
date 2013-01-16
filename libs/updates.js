var http = require ('http'),
	_ = require ('lodash'),

	mixins = require ('fos-mixins'),
	request = require ('fos-request');


module.exports = function (server) {
	this.server = server;
	this.connect ();
};

mixins (['emitter'], module.exports);

module.exports.prototype = _.extend (module.exports.prototype, {
	settings: null,
	url: null,
	streaming: false,

	connect: function () {
		this.fetchSettings ()
			.then (_.bind (this.updateSettings, this))
			.then (_.bind (this.stream, this))
			.fail (console.error)
			.done ();
	},

	fetchSettings: function (callback) {
		return request ({
			url: this.server.url + '_config/http-notifications',
			oauth: this.server.settings.oauth,
			accept: 'application/json'
		});
	},

	updateSettings: function (settings) {
		this.settings = settings;
	},

	stream: function () {
		if (this.streaming) return;
		this.streaming = true;

		var request = http.request ({
			host: this.server.settings.host,
			port: this.settings.port
		});

		var callback = _.bind (this.notify, this);

		request.on ('response', function (response) {
			response.on ('data', function (chunk) {
				var lines = chunk.toString ('utf-8').split ('\n');
				
				_.each (lines, function (line) {
					if (!line) return;

					try {
						callback (JSON.parse (line));
					} catch (e) {
						console.error ('Failed to parse update seq', line);
						console.error (e.message, e.stack);
					}
				});
			});
		});
		
		var restart = _.debounce (_.bind (function () {
			this.streaming = false;
			this.stream ();
		}, this), 100);
		
		
		request.on ('close', restart);
		request.on ('error', restart);
		request.on ('end', restart);

		request.on ('error', function (error) {
			console.error ('HTTP Error while streaming changes', error.code);
		});

		request.end ();
	},

	notify: function (event) {
		this.emit (event.type, event.db);
	}
});

