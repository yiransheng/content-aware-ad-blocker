var _ = require('lodash');
var member = require('./member');

var defaults = {
  verbose : false,
  metadata : null,
  expressionType : 'member'
};

module.exports = function (filename, options) {
  options = _.assign({}, defaults, options || {});
  // Support binary, unary etc types soon
  var tokenize;
  if (options.verbose) {
    console.error('[Tokenizing] ' + filename);
    console.error('[Tokenize Options] ' + JSON.stringify(options));
  }
  if (options.expressionType !== 'member') {
    throw "Unsupported Expression Type";
  } else {
    tokenize = member; 
  }

  tokenize(filename, function (err, nodes) {

    if (err) {
      console.error('[Parse Error] ' + filename, err);
      return;
    }

    nodes.forEach(n => {
      var value = n;
      if (options.metadata && _.isObject(options.metadata)) {
        value = Object.assign(value, options.metadata);
      }
      // stdout is data
      console.log(JSON.stringify(value));
    });
    if (options.verbose) {
      console.error('[Success] found ' + nodes.length + ' tokens for: ' + filename);
    }
  });
}
