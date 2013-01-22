var _ = require ('lodash'),
	View = require ('./view'),
	mixins = require ('fos-mixins');

module.exports = function (database) {
	this.database = database.lock (this);
	this.views = {};
};

mixins (['lock'], module.exports);


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
		this.disposing = null;
		this.database.release (this, true);
	},

	cleanup: function () {
		this.database = null;
		this.views = null;
	}
});
