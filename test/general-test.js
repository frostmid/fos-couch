var vows = require ('vows'),
	assert = require ('assert'),

	Q = require ('q'),
	_  = require ('lodash'),
	Server = require ('../index.js');

var settings = {
	secure: false,
	host: '89.179.119.16',
	port: 5984,
	_oauth: {
		consumer_key: "61a712f6c38206b3c78b-1",
		consumer_secret: "29db78b67a412c90e7bf-1",
		token: "personal-2ca6ab4d2f91a8d84087-1",
		token_secret: "0ecc8b3c04d821cc7b6b-1"
	},
	auth: {
		username: 'lyxsus@gmail.com',
		password: 'letmein'
	}
};



vows.describe ('fos-couch/general').addBatch ({
	'Server': {
		topic: new Server (settings),

		'database': {
			topic: function (server) {
				var that = this,
					success = function (topic) {
						that.callback (null, topic);
					};

				Q.when (server.database ('app/test'))
					.fail (that.callback)
					.then (success)
					.done ();
			},

			'returns object': function (database) {
				assert.isObject (database);
			},

			'get existing document': {
				topic: function (database) {
					var that = this;

					Q.when (database.documents.get ('urn:debug:test/47c60ae3261a34fabc2cd2a7e1eb3120'))
						.then (function (doc) {
							that.callback (null, doc);
						})
						.fail (that.callback)
						.done ();
				},

				'with no errors': function (doc) {
					assert.isNull (doc.error);
				}
			},

			'get unexisting document': {
				topic: function (database) {
					var that = this;

					Q.when (database.documents.get ('i am not found'))
						.then (function (doc) {
							that.callback (null, doc);
						})
						.fail (function (error) {
							that.callback (null, error)
						})
						.done ();
				},

				'with error': function (doc) {
					assert.isNotNull (doc.error);
				}
			},

			'create new document': {
				topic: function (database) {
					var that = this,
						data = {
							title: 'Only for test',
							type: 'urn:types/47c60ae3261a34fabc2cd2a7e1ea7d77'
						};

					Q.when (database.documents.create ('urn:debug:test', data))
						.then (function (doc) {
							that.callback (null, doc);
						})
						.fail (this.callback)
						.done ();
				},

				'with no errors': function (doc) {
					assert.isNull (doc.error);
				},

				'monitor update event': {
					topic: function (doc) {
						var that = this,
							timeout = setTimeout (function () {
								that.callback ('Trigger timed out');
							}, 5 * 1000);

						doc.once ('change', function () {
							clearInterval (timeout);
							that.callback ();
						});
					},

					'wait for change event to be triggered': function () {}
				},

				'save property': {
					topic: function (doc) {
						var that = this;

						Q.when (doc.ready ())
							.then (function (doc) {
								// console.log ('!!!', 'update doc', doc);
								doc.save ('urn:debug:test', {title: 'title changed'});
							})
							.then (function (doc) {
								that.callback (null, doc);
							})
							.fail (that.callback)
							.done ();
					},

					'ok': function (doc) {
						// console.log ('#', doc);
						// assert.isNull (doc.error);
					}
				},

				'then delete document': {
					topic: function (doc) {
						var that = this;

						Q.when (doc.ready ())
							.then (function () {
								doc.once ('change', function () {
									// console.log ('!!!', 'remove doc');
									doc.remove ()
										.then (function (arg) {
											that.callback (null, arg);
										})
										.fail (function (arg) {

											that.callback (null, arg);
										})
										.done ();
								});
							})
							.done ();
					},

					'not found': function (doc) {
						// console.log (doc);
						assert (doc.error, 'not_found');
					}
				}
			}
		}
	}
}).export (module);
