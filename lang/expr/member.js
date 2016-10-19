var parse = require('../parse');
var _  = require('lodash');

function filterAst(ast) {
  var nodes = [];  
  if (!_.isObject(ast)) {
    return nodes;
  }
  if (_.isArray(ast)) {
    return _.flatMap(ast, filterAst);
  }
  if (ast.type !== 'MemberExpression') {
    var restNodes = _.flatMap(Object.keys(ast), function(k) {
      return filterAst(ast[k]);
    });
    return restNodes;
  }
  if (_.get(ast, 'object.type') !== 'Identifier') {
    return nodes;
  }
  if (_.get(ast, 'property.type') !== 'Identifier') {
    return nodes;
  }
  if (ast.object.name.length < 3 || ast.object.name.length > 50) {
    return nodes;
  }
  if (ast.property.name.length < 3 || ast.property.name.length > 50) {
    return nodes;
  }
  nodes.push(ast);

  return nodes;
}

module.exports = function (filename, callback) {
  parse(filename, (err, ast) => {
    if (err) {
      callback(err, null);
      return;
    }
    try {
      var nodes = filterAst(ast);
      callback(null, nodes);
    } catch (err) {
      callback({
        stage : 'Tokenizing AST',
        error : err
      }, null);
    }
  });
}
