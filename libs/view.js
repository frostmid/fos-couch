var _ = require ('lodash'),

	mixin = require ('fos-mixin'),
	request = require ('fos-request'),
	evaluate = require ('fos-evaluate'),
	hash = require ('fos-hash'),

	Fragment = require ('./fragment');
	

module.exports = function (views, id, design, view) {
	this.id = id;
	this.views = views;
	this.database = views.database;

	this.design = design;
	this.view = view;
	this.designDocId = '_design/' + design;

	this.url = this.database.url +
		'_design/' + encodeURIComponent (design) +
		'/_view/' + encodeURIComponent (view);

	this.fragments = [];
};


mixin (module.exports);


_.extend (module.exports.prototype, {
	designDoc: null,

	fetch: function () {
		return this.database.documents.get (this.designDocId);
	},

	fetched: function (designDoc) {
		(this.designDoc = designDoc).lock (this)
			.on ('change', _.bind (function () {
				_.each (this.fragments, function (fragment) {
					fragment.refetch ();
				});
			}, this));
	},

	key: function (params) {
		return hash (JSON.stringify ([
			params.key,
			params.keys,
			params.startkey,
			params.endkey,
			params.descending,
			params.limit,
			params.skip
		]));
	},

	get: function (params) {
		var id = this.key (params);
		
		if (!this.has (id)) {
			this.fragments [id] = new Fragment (this, id, params);
		}

		return this.fragments [id].ready ();
	},

	has: function (id) {
		return this.fragments [id] != undefined;
	},

	unset: function (id) {
		if (this.fragments) {
			delete this.fragments [id];
		}
	},

	notify: function (event) {
		var fragments = _.filter (this.fragments, function (fragment) {
			return !fragment.fetching;
		});

		if (!fragments.length) return;

		evaluate (this.designDoc.data.views [this.view].map, {
			emit: function (key, value) {
				_.each (fragments, function (fragment) {
					fragment.notify (key);
				})
			}
		}) (event.doc);
	},

	dispose: function () {
		this.views.unset (this.id);

		this.designDoc.release (this);

		this.cleanup ();
	},

	cleanup: function () {
		this.database = null;
		this.fragments = null;
		this.views = null;
		this.designDoc = null;
	}
});
