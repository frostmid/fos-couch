var _ = require ('lodash'),

	mixins = require ('fos-mixins'),
	request = require ('fos-request'),
	evaluate = require ('fos-evaluate'),
	hash = require ('fos-hash'),

	Fragment = require ('./fragment');
	
	


module.exports = function (database, design, view) {
	this.database = database;
	this.design = design;
	this.view = view;

	this.designDocId = '_design/' + design;

	this.url = database.url +
		'_design/' + encodeURIComponent (design) +
		'/_view/' + encodeURIComponent (view);

	this.fragments = {};
};


mixins (['ready'], module.exports);


_.extend (module.exports.prototype, {
	designDoc: null,

	fetch: function () {
		return this.database.documents.get (this.designDocId);
	},

	update: function (designDoc) {
		(this.designDoc = designDoc)
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
			params.descending
		]));
	},

	get: function (params) {
		var id = this.key (params);
		
		if (!this.has (id)) {
			this.fragments [id] = new Fragment (this, params);
		}

		return this.fragments [id].ready ();
	},

	has: function (id) {
		return this.fragments [id] != undefined;
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
	}
});
