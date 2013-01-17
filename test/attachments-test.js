var vows = require ('vows'),
	assert = require ('assert'),

	fs = require ('fs'),
	Q = require ('q'),
	_  = require ('lodash'),
	Server = require ('../index.js');

var settings = {
	secure: false,
	host: '192.168.1.42',
	port: 5984,
	oauth: {
		consumer_key: "61a712f6c38206b3c78b-1",
		consumer_secret: "29db78b67a412c90e7bf-1",
		token: "personal-2ca6ab4d2f91a8d84087-1",
		token_secret: "0ecc8b3c04d821cc7b6b-1"
	}
};

vows.describe ('fos-couch/attachments').addBatch ({
	'get document': {
		topic: function () {
			var server = new Server (settings),
				that = this;

			Q.when (server)
				.then (function () {
					return server.database ('app/test');
				})
				.then (function (database) {
					return database.documents.get ('urn:debug:test/47c60ae3261a34fabc2cd2a7e1ed9859');
				})
				.then (function (doc) {
					that.callback (null, doc);
				})
				.fail (that.callback)
				.done ();
		},

		'no errors reported': function (doc) {
			assert.isNull (doc.error);
		},

		'then attach a file': {
			topic: function (doc) {
				var that = this,
					stream = fs.createReadStream ('./test/attachment.txt');
				
				doc.saveAttachment ({
					name: 'readme.txt',
					contentType: 'text/plain',
					body: stream
				})
					.then (function (doc) {
						that.callback (null, doc);
					})
					.fail (that.callback)
					.done ();
			},

			'no errors': function (doc) {
				assert.isNull (doc.error);
			},

			'get an attachment': {
				topic: function (doc) {
					var that = this;

					Q.when (doc.ready ())
						.then (function () {
							return doc.getAttachment ('readme.txt');	
						})
						.then (function (stream) {
							that.callback (null, stream);
						})
						.fail (that.callback)
						.done ();
				},

				'stream returned': function (response) {
					assert (typeof response.pipe, 'function');
				},

				'remove attachment': {
					topic: function (response, doc) {
						var that = this;

						Q.when (doc.ready ())
							.then (function () {
								return doc.removeAttachment ('readme.txt');
							})
							.then (function (arg) {
								that.callback (null, arg);
							})
							.fail (that.callback)
							.done ();
					},

					'with no errors': function (doc) {
						assert.isNull (doc.error);
					}
				}
			}
		}
	}
}).export (module);;