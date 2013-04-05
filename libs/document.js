var _ = require ('lodash'),

	mixin = require ('fos-mixin'),
	request = require ('fos-request');

function filterDoc (data) {
	var result = {},
		allowed = ['_id', '_rev', '_attachments', '_deleted'];

	for (var i in data) {
		if (i.substring (0, 1) == '_' && allowed.indexOf (i) === -1) {
			continue;
		}
		result [i] = data [i];
	}

	return result;
}


module.exports = function (documents, id) {
	this.documents = documents;
	this.database = documents.database.lock (this);
	this.id = id;
	this.url = this.database.url + encodeURIComponent (id) + '/';

	this.setMaxListeners (1004);
};

mixin (module.exports);

function parseRev (rev) {
	return parseInt (rev.split ('-') [0] || 0);
}

_.extend (module.exports.prototype, {
	data: null,
	
	disposeDelay: 1000,
	
	fetch: function () {
		return request ({
			url: this.url,
			accept: 'application/json',
			auth: this.database.server.settings.auth	// TODO: Reimplement
		});
	},

	fetched: function (data) {
		this.update (data);
	},

	update: function (data) {
		var previousData = this.data;

		if (previousData) {
			// Don't update on previous revision
			if (parseRev (data._rev) <= parseRev (previousData._rev)) {
				return;
			}
		}

		this.data = data;
		this.emit ('change');
	},

	merge: function (data) {
		this.data = _.extend (this.data, data);
	},

	get: function (key) {
		return this.data [key];
	},

	has: function (key) {
		return this.data [key] != undefined;
	},

	remove: function (sign) {
		this.merge ({
			_deleted: true
		});

		return this.save (null, sign);
	},

	save: function (designDocId, sign) {
		var url = this.url,
			self = this;
			
		if (designDocId) {
			url = this.database.url + '_design/' + encodeURIComponent (designDocId) +
				'/_update/' + encodeURIComponent (this.data.type) +
				'/' + encodeURIComponent (this.data._id);
		}

		return request ({
			url: url,
			accept: 'application/json',
			method: 'PUT',
			body: JSON.stringify (filterDoc (this.data)),
			headers: {
				'content-type': 'application/json'
			},
			auth: sign.auth,
			oauth: sign.oauth,
		})
			.then (function (result) {
				if (result.doc) {
					self.update (result.doc);
					this.error = null;
				} else {
					console.log ('!!!!', result);
					return self.returnNotReady ().ready ();
				}
			})
			// .fail (_.bind (this.returnError, this));
	},

	getAttachment: function (name, sign) {
		return request ({
			url: this.url + encodeURIComponent (name),
			auth: sign.auth,
			oauth: sign.oauth,
			returnRequest: true
		});
	},

	saveAttachment: function (attachment, sign) {
		return request ({
			url: this.url + encodeURIComponent (attachment.name) + '?rev=' + this.get ('_rev'),
			accept: 'application/json',
			method: 'PUT',
			body: attachment.body,
			headers: {
				'content-type': attachment.contentType
			},
			auth: sign.auth,
			oauth: sign.oauth,
		})
			.then (_.bind (this.returnNotReady, this))
			.then (_.bind (this.ready, this));
	},

	removeAttachment: function (name, sign) {
		return request ({
			url: this.url + encodeURIComponent (name) + '?rev=' + this.get ('_rev'),
			accept: 'application/json',
			method: 'DELETE',
			auth: sign.auth,
			oauth: sign.oauth,
		})
			.then (_.bind (this.returnNotReady, this))
			.then (_.bind (this.ready, this));
	},

	dispose: function () {
		this.documents.unset (this.id);

		this.data = null;
		this.documents = null;
		this.database = null;
	}
});

