var _ = require ('lodash'),
	Promises = require ('vow'),
	querystring = require ('querystring'),
	request = require ('fos-request'),
	mixin = require ('fos-mixin');

module.exports = function (view, id, params) {
	this.id = id;
	this.view = view.lock (this);
	this.params = params;

	this.fetchReduced = true;
	this.fetchNonReduced = true;
	this.previousReduceData = null;
	this.previousNonReducedData = null;

	this.setMaxListeners (1003);
	this.refetch = _.throttle (_.bind (this.refetch, this), 1500, true);
	// this.refetch = _.debounce (_.bind (this.refetch, this), 250);
};

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

	// if (params.reduce) {
	// 	result ['stale'] = 'update_after';
	// }

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

function fixParams (params) {
	if (typeof params.group_level == 'undefined') {
		return params;
	} else {
		var tmp = _.extend ({}, params);
		delete tmp ['group_level'];
		return tmp;
	}
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
	if (frag.group_level) {
		key = key.slice (0, parseInt (frag.group_level));
	}

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
	str = str.toLowerCase ();

	if (!str.match (' ')) {
		str = '(' + str + ' OR ' + str + '*)';
	}
	return str;
}


function parseRev (rev) {
	return parseInt (rev.split ('-') [0] || 0);
}

function _emptyResult () {
	return {rows: [], total_rows: 0, offset: 0, update_seq: null};
}

mixin (module.exports);

_.extend (module.exports.prototype, {
	disposeDelay: 1000,

	fetch: function () {
		var params = this.params,
			self = this;

		if (params.fti) {
			return this.requestCouchDbLucene (params)
				.then (_.bind (this.formatFullText, this))
		} if (params.autoreduce) {
			return Promises.all ([this.requestCouchDb (fixParams (params)), this.requestCouchDb (autoReduce (params))])
				.fail (function (error) {
					if (error.stack) {
						console.error ('Failed to fetch view fragment', error.message, error.stack);
					} else {
						console.error ('Failed to fetch view fragment', error);
					}
					return Promises.reject (error);
				})
				.then (function (responses) {
					this.previousNonReducedData = responses [0];
					this.previousReducedData = responses [1];

					if (responses [1].rows.length) {
						var summary = responses [1].rows [0].value,
							update_seq = responses [1].update_seq;

						if (!update_seq) {
							update_seq = self.view.views.database.info.update_seq;
						}

						return _.extend (responses [0], {
							summary: summary,
							total_rows: summary.count || summary.total_rows,
							update_seq: update_seq,
							reduce_rows: responses [1].rows
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
			return Promises.when (this.requestCouchDb (params))
				.then (_.bind (this.format, this));
		}
	},

	requestCouchDb: function (params) {
		if (params.limit === '0' || params.limit === 0) {
			return _emptyResult ();
		}

		if (params.reduce) {
			if (!this.fetchReduced && this.previousReduceData) {
				return this.previousReduceData;
			} else {
				this.fetchReduced = false;
			}
		} else {
			if (!this.fetchNonReduced && this.previousNonReducedData) {
				return this.previousNonReducedData;
			} else {
				this.fetchNonReduced = false;
			}
		}

		return request ({
			method: params.keys ? 'POST' : 'GET',
			url: applyParams (this.view.url, params),
			accept: 'application/json',
			body: params.keys ? JSON.stringify ({keys: params.keys}) : null,
			headers: {
				'content-type': 'application/json',
				'accept-encoding': 'gzip, deflate'
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
      
        if (params.fields) {
            delete params.fields.disabled;
        }

		if (params.fields && _.size (params.fields)) {
			var tmp = [];

			if (params.search) {
				tmp.push ('(default:' + _ftiSearchString (params.search) + ')')
			}

			_.each (params.fields, function (value, index) {
				if (index != 'index') {
					tmp.push ('(' + index + ':"' + value.toLowerCase () + '")');
				}
			});

			search = tmp.join (' AND ');
		} else {
			search = _ftiSearchString (params.search);
		}

		url += '?q=' + encodeURIComponent (search);
		// url += '&stale=ok';

		if (params.include_docs) {
			url += '&include_docs=false';
		}

		// url += '&stale=update_after';

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
		var db_update_seq = this.view.database.info.update_seq;
		
		json ['_rev'] = (json ['update_seq'] || db_update_seq) + '-update_seq';
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
		var previousData = this.data;

		if (previousData) {
			// Don't update on previous revision
			if (parseRev (data._rev) <= parseRev (previousData._rev)) {
				return;
			}

			// Don't update, if rows and summary are the same
			if (_.isEqual (previousData.rows, data.rows) && _.isEqual (previousData.summary, data.summary) && _.isEqual (previousData.reduce_rows, data.reduce_rows)) {
				return;
			}
		}

		this.skipNonReduced = false;
		this.skipReduced = false;

		this.data = data;
		this.emit ('change');
	},

	hasId: function (id) {
		if (!this.data || !this.data.rows) return false;

		return _.any (this.data.rows, function (row) {
			return id == row.id;
		});
	},

	notify: function (keys, deleted, id) {
		if (this.disposing) return;

		var params = this.params,
			hasId = this.hasId (id),
			matchedKey = _.find (keys, function (key) { return _match (key, params); }),
			matched = matchedKey !== undefined;

		if (matched || (hasId && deleted)) {
			this.fetchReduced = true;
		}

		if (hasId) {
			if (!matched || deleted)  {
				this.fetchNonReduced = true;						
			}
		} else {
			if (!deleted && matched && params.limit) {
				if (this.data && this.data.rows && (this.data.rows.length == params.limit)) {
					var lastKey = _.first (this.data.rows).key;

					// console.log ('* refetch', params, matchedKey, lastKey);

					if (_eq (matchedKey, lastKey)) {
						this.fetchNonReduced = true;
					} else if (params.descending) {
						if (lastKey < matchedKey) {
							this.fetchNonReduced = true;
						}
					} else {
						if (lastKey > matchedKey) {
							this.fetchNonReduced = true;
						}
					}
					
				} else {
					this.fetchNonReduced = true;
				}
			}
		}

		if (this.fetchNonReduced || this.fetchReduced) {
			// this.fetchNonReduced = true;
			// this.fetchReduced = true;

			return this.refetch ();
		}
	},

	dispose: function () {
		this.view.unset (this.id);
		
		this.view.release (this);

		this.cleanup ();
	},

	cleanup: function () {
		this.data = null;
		this.view = null;
		this.params = null;
	}
});