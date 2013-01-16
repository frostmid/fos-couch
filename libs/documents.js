var _ = require ('lodash'),
	Document = require ('./document');


module.exports = function (database) {
	this.database = database;
	this.docs = {};
};

_.extend (module.exports.prototype, {
	get: function (id) {
		if (!this.has (id)) {
			this.docs [id] = new Document (this.database, id);
		}

		return this.docs [id].ready ();
	},

	has: function (id) {
		return this.docs [id] != undefined;
	}
});
