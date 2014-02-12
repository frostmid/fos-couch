var _ = require ('lodash'),
	request = require ('fos-request'),
	Document = require ('./document.js'),
	mixin = require ('fos-mixin');

module.exports = function (database) {
	this.id = 'documents #' + database.name;
	this.database = database;
	this.docs = {};
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	get: function (id) {
		if (!id) {
			throw new Error ('Id required to get a document');
		}

		if (!this.has (id)) {
			this.docs [id] = new Document (this, id);
		}
		return this.docs [id].ready ();
	},

	unset: function (id) {
		delete this.docs [id];
	},

	create: function (designDocId, data, sign) {
		var url = this.database.url,
			method = 'POST',
			self = this;

		if (designDocId == '_security') {
			url = this.database.url + '_security';
			method = 'PUT';
		}

		return request (_.extend ({
			url: url,
			method: method,
			body: JSON.stringify (data),
			accept: 'application/json',
			headers: {
				'content-type': 'application/json',
				'accept-encoding': 'gzip, deflate'
			}
		}, sign))
			.then (function (resp) {
				var id = resp.id;

				return self.has (id)
					? self.get (id)
						.returnNotReady ()
						.ready ()
							.then (function (doc) {
								_.defer (function () {
									doc.emit ('change');
								});

								return doc;
							})
					: self.get (id);
			});
	},

	has: function (id) {
		return this.docs [id] != undefined;
	},

	dispose: function () {
		this.database = null;
		this.docs = null;
	}
});