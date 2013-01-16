var querystring = require ('querystring'),
	_ = require ('lodash'),

	request = require ('fos-request'),
	mixins = require ('fos-mixins');


module.exports = function (view, params) {
	this.view = view;
	this.params = params;
};

mixins (['emitter', 'ready'], module.exports);

var paramsKeys = ['descending', 'include_docs', 'reduce',
	'key', 'startkey', 'endkey', 'keys',
	'limit', 'skip', 'group', 'group_level'];

function filterParams (params) {
	return _.reduce (params, function (memo, value, index) {
		if (paramsKeys.indexOf (index) !== -1) {
			memo [index] = value;
		}
		return memo;
	}, {});
}

function applyParams (url, params) {
	return url + '?' + querystring.stringify (filterParams (params));
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
			throw new Error ('Not implemented');
		} else {
			return request ( applyParams (this.view.url, params));
		}
	},

	update: function (data) {
		this.data = data;
		this.emit ('change');
	},

	notify: function (key) {
		if (_match (key, this.params)) {
			this.refetch ();
		}
	}
});
