var querystring = require ('querystring'),
	_ = require ('lodash'),
	Q = require ('q'),

	request = require ('fos-request'),
	mixin = require ('fos-mixin');


module.exports = function (view, id, params) {
	this.id = id;
	this.view = view.lock (this);
	this.params = params;

	this.setMaxListeners (1003);
};

mixin (module.exports);

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

	if (params.reduce) {
		delete params.limit;
	}

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
	delete reduceParams ['autoreduce'];

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


// Fix fti search string
function _ftiSearchString (str) {
	if (!str.match (' ')) {
		str = '(' + str + ' OR ' + str + '*)';
	}
	return str;
}


_.extend (module.exports.prototype, {
	disposeDelay: 1000,

	fetch: function () {
		var params = this.params,
			self = this;

		if (params.fti) {
			return this.requestCouchDbLucene (params)
				.then (_.bind (this.formatFullText, this))
		} if (params.autoreduce) {
			return Q.all ([this.requestCouchDb (params), this.requestCouchDb (autoReduce (params))])
				.fail (console.error)
				.then (function (responses) {
					if (responses [1].rows.length) {
						var summary = responses [1].rows [0].value,
							update_seq = responses [1].update_seq;

						if (!update_seq) {
							update_seq = self.view.views.database.info.update_seq;
						}

						return _.extend (responses [0], {
							summary: summary,
							total_rows: summary.count || summary.total_rows,
							update_seq: update_seq
						});
					} else {
						return _.extend (responses [0], {
							total_rows: 0,
							update_seq: self.view.views.database.info.update_seq
						});
					}
				})
				.then (_.bind (this.format, this));
		} else {
			return this.requestCouchDb (params)
				.then (_.bind (this.format, this));
		}
	},

	requestCouchDb: function (params) {
		if (params.limit == '0') {
			return {rows: [], total_rows: 0, offset: 0, update_seq: null};
		}

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

	requestCouchDbLucene: function (params) {
		var url = this.view.database.server.url
			+ '_fti/local/'
			+ encodeURIComponent (this.view.database.name)
			+ '/_design/' + this.view.design + '/' + encodeURIComponent (this.view.view);

		var search;

		if (params.fields && _.size (params.fields)) {
			var tmp = [];

			if (params.search) {
				tmp.push ('(default:' + _ftiSearchString (params.search) + ')')
			}

			_.each (params.fields, function (value, index) {
				tmp.push ('(' + index + ':"' + value + '")');
			});

			search = tmp.join (' AND ');
		} else {
			search = _ftiSearchString (params.search);
		}

		url += '?q=' + encodeURIComponent (search);
		url += '&stale=ok';

		if (params.include_docs == 'true') {
			url += '&include_docs=true';
		}

		return request ({
			method: params.keys ? 'POST' : 'GET',
			url: url,
			accept: 'application/json',
			headers: {
				'content-type': 'application/json'
			},
			auth: this.view.database.server.settings.auth
		});
	},

	format: function (json) {
		json ['_rev'] = (json ['update_seq'] || 0) + '-update_seq';
		delete json ['update_seq'];

		json ['type'] = this.params.type;
		json.options = this.params.options;

		return json;
	},

	formatFullText: function (json) {
		return {
			_rev: Date.now () + '-' + json.etag,
			total_rows: json.total_rows || 0,
			offset: this.params.skip || 0,
			type: this.params.type,
			options: this.params.options,
			rows: _.map (json.rows, function (row) {
				return {
					id: row.id,
					key: row.score,
					doc: row.doc || null
				};
			})
		};
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
		if (!this.disposing && _match (key, this.params)) {
			return this.refetch ();
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
