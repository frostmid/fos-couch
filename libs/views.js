var _ = require ('lodash'),
	View = require ('./view'),
	mixin = require ('fos-mixin');

module.exports = function (database) {
	this.database = database;
	this.views = {};
};

mixin (module.exports);


_.extend (module.exports.prototype, {
	key: function (design, view) {
		return design + '/' + view;
	},

	get: function (design, view) {
		var id =  this.key (design, view);

		if (!this.has (id)) {
			this.views [id] = new View (this, id, design, view);
		}

		return this.views [id].ready ();
	},

	has: function (id) {
		return this.views [id] != undefined;
	},

	unset: function (id) {
		delete this.views [id];
	},

	dispose: function () {
		this.database = null;
		this.views = null;
	}
});
