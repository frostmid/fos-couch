var querystring = require ('querystring'),
	_ = require ('lodash'),
	Q = require ('q'),

	request = require ('fos-request'),
	mixins = require ('fos-mixins');


module.exports = function (view, id, params) {
	this.id = id;
	this.view = view.lock (this);
	this.params = params;
};

mixins (['emitter', 'ready', 'lock'], module.exports);

var paramsKeys = ['descending', 'include_docs', 'reduce',
	'key', 'startkey', 'endkey',
	'limit', 'skip', 'group', 'group_level'];

var stringifyKeys = ['key', 'startkey', 'endkey'];

function filterParams (params) {
	var result = _.reduce (params, function (memo, value, index) {
		if (paramsKeys.indexOf (index) !== -1) {
			if (stringifyKeys.indexOf (index) !== -1) {
				value = JSON.stringify (value);
			}

			memo [index] = value;
		}
		return memo;
	}, {});

	result ['update_seq'] = true;

	return result;
}

function applyParams (url, params) {
	var result = url + '?' + querystring.stringify (
		filterParams (params)
	);

	// TOFIX: Dirty hack
	if (params.keys && params.reduce) {
		result += '&group=true';
	}

	return result;
}

function autoReduce (params) {
	var reduceParams = _.extend ({}, params, {
		reduce: true
	});

	delete reduceParams ['include_docs'];
	delete reduceParams ['limit'];
	delete reduceParams ['skip'];

	return reduceParams;
}

// Check, if keys are equal
var _eq = function (left, right) {
	if (!left || !right) return left == right;
	return left.toString () == right.toString ();
};

function _defined (key) {
	return key !== undefined;
}

// Match key agains frag
function _match (key, frag) {
	if (frag.keys) {
		return _.any (frag.keys, function (k) {
			return _eq (k, key);
		});
	}

	if (_defined (frag.key) && !_eq (frag.key, key)) return false;
	if (frag.descending) {
		if (_defined (frag.startkey) && frag.startkey < key) return false;
		if (_defined (frag.endkey) && frag.endkey > key) return false;
	} else {
		if (_defined (frag.startkey) && frag.startkey > key) return false;
		if (_defined (frag.endkey) && frag.endkey < key) return false;
	}

	return true;
}


_.extend (module.exports.prototype, {
	fetch: function () {
		var params = this.params;

		if (params.fti) {
			throw new Error ('Not implemented');
		} if (params.autoreduce) {
			return Q.all ([this.requestCouchDb (params), this.requestCouchDb (autoReduce (params))])
				.fail (console.error)
				.then (function (responses) {
					var summary = responses [1].rows [0].value;

					return _.extend (responses [0], {
						summary: summary,
						total_rows: summary.count
					});
				})
				.then (_.bind (this.format, this));
		} else {
			return this.requestCouchDb (params)
				.then (_.bind (this.format, this));
		}
	},

	requestCouchDb: function (params) {
		return request ({
			method: params.keys ? 'POST' : 'GET',
			url: applyParams (this.view.url, params),
			accept: 'application/json',
			body: params.keys ? JSON.stringify ({keys: params.keys}) : null,
			headers: {
				'content-type': 'application/json'
			},
			auth: this.view.database.server.settings.auth
		});
	},

	format: function (json) {
		json ['_rev'] = json ['update_seq'] + '-update_seq';
		delete json ['update_seq'];

		json ['type'] = this.params.type;

		return json;
	},

	get: function (key) {
		return this.data [key];
	},

	has: function (key) {
		return this.data [key] != undefined;
	},

	fetched: function (data) {
		this.data = data;
		this.emit ('change');
	},

	notify: function (key) {
		if (_match (key, this.params)) {
			this.refetch ();
		}
	},

	dispose: function () {
		this.view.unset (this.id);

		this.removeAllListeners ();
		
		this.view.release (this);

		this.cleanup ();
	},

	cleanup: function () {
		this.data = null;
		this.view = null;
		this.params = null;
	}
});
