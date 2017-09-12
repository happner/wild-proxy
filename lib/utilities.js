function Utilities(options) {

  this.__options = options;
}

Utilities.create = function (options) {
  return new Utilities(options);
};

Utilities.prototype.stringifyError = function(err) {

  var plainError = {};

  Object.getOwnPropertyNames(err).forEach(function(key) {
    plainError[key] = err[key];
  });

  return JSON.stringify(plainError);
};

module.exports = Utilities;
