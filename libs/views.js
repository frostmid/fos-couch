var View = require ('./view');

module.exports = function (database) {
	this.database = database;
	this.views = {};
};


module.exports.prototype = {
	key: function (design, view) {
		return design + '/' + view;
	},

	get: function (design, view) {
		var id =  this.key (design, view);

		if (!this.has (id)) {
			this.views [id] = new View (this.database, design, view);
		}

		return this.views [id].ready ();
	},

	has: function (id) {
		return this.views [id] != undefined;
	}
};
