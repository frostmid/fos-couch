var _ = require ('lodash'),
	Promises = require ('vow'),

	mixin = require ('fos-mixin'),
	request = require ('fos-request'),
	evaluate = require ('fos-evaluate'),
	hash = require ('fos-hash'),

	Fragment = require ('./fragment');
	

module.exports = function (views, id, design, view) {
	this.id = id;
	this.views = views;
	this.database = views.database.lock (this);

	this.design = design;
	this.view = view;
	this.designDocId = '_design/' + design;

	this.url = this.database.url +
		'_design/' + encodeURIComponent (design) +
		'/_view/' + encodeURIComponent (view);

	this.fragments = {};

	this.ddocChanged = _.bind (this.ddocChanged, this);
};


mixin (module.exports);


_.extend (module.exports.prototype, {
	designDoc: null,

	fetch: function () {
		return this.database.documents.get (this.designDocId);
	},

	fetched: function (designDoc) {
		if (this.designDoc) {
			this.designDoc.removeListener ('change', this.ddocChanged);
		}

		(this.designDoc = designDoc).lock (this)
			.on ('change', this.ddocChanged);
	},

	ddocChanged: function () {
		_.each (this.fragments, function (fragment) {
			fragment.refetch ();
		});
	},

	key: function (params) {
		return hash (JSON.stringify ([
			params.key,
			params.keys,
			params.startkey,
			params.endkey,
			params.descending,
			params.limit,
			params.skip,
			params.fti,
			params.search,
			params.autoreduce == 'true',
			params.include_docs == 'true'
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
		delete this.fragments [id];
	},

	notify: function (event) {
		var fragments = _.filter (this.fragments, function (fragment) {
			return !fragment.params.fti;
		});

		if (!fragments.length) return;

		var view = this.designDoc.data.views [this.view];

		if (view) {
			evaluate (view.map, {
				emit: function (key, value) {
					_.each (fragments, function (fragment) {
						if (fragment.notify (key)) {
							fragments = _.without (fragment);
						}
					});
				}
			}) (event.doc);
		} else {
			console.log ('Can\'t notify view about update (view fun not found)', this.id);
		}
	},

	dispose: function () {
		this.views.unset (this.id);

		this.designDoc.removeListener ('change', this.ddocChanged);
		this.designDoc.release (this);

		this.database.release (this);	// TODO: Check for crash

		this.database = null;
		this.fragments = null;
		this.views = null;
		this.designDoc = null;
		this.ddocChanged = null;
	}
});
