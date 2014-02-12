var _ = require ('lodash'),
	Promises = require ('vow'),
	evaluate = require ('fos-evaluate'),
	Fragment = require ('./fragment.js'),
	hash = require ('fos-hash'),
	mixin = require ('fos-mixin');

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
			params.group_level,
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
		}), view, hasFreeFragments;

		if (!fragments.length) return;

		// todo: if all fragments are disposing or refetch, or fetching, skip this step
		hasFreeFragments = _.any (fragments, function (fragment) {
			return !fragment.disposing && !fragment.refetching;
		});

		if (!hasFreeFragments) {
			return;
		}

		view = this.designDoc.data.views [this.view];

		if (view) {
			var keys = [];

			evaluate (view.map, {
				emit: function (key, value) {
					keys.push (key);
				}
			}, (this.view + this.designDoc.data._rev)) (event.doc);


			_.each (fragments, function (fragment, index) {
				if (fragment) {
					fragment.notify (keys, !!event.deleted, event.id);
				}
			});
		} else {
			console.log ('Can\'t notify view about update (view fun not found)', this.id);
		}
	},

	dispose: function () {
		this.views.unset (this.id);

		if (this.designDoc) {
			this.designDoc.removeListener ('change', this.ddocChanged);
			this.designDoc.release (this);
		}

		this.database.release (this);	// TODO: Check for crash

		this.database = null;
		this.fragments = null;
		this.views = null;
		this.designDoc = null;
		this.ddocChanged = null;
	}
});