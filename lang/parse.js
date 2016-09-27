var fs = require('fs');
var esprima = require('esprima');

module.exports = function parse(filename, callback) {
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err) {
      callback(err, null);
      return;
    }
    try {
      var ast = esprima.parse(data.toString());
      callback(null, ast);
    } catch (parseErr) {
      callback(parseErr, null);
    }
  });
}
