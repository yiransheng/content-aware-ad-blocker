#!/usr/bin/env node

var _ = require('lodash');
var glob = require('glob-all');
var tokenize = require('./expr');
var clc = require('cli-color');

var _error = console.error;
console.error = function() {
  var args = _.toArray(arguments)
    .map(arg => clc.red(arg));
  _error.apply(console, args);
}

var argv = require('yargs')
  .usage('Usage: $0 _filepattern_')
  .example('$0 **/*.js', 'can use glob pattern')
  .demand(1)
  .help('help')
  .options({
    'v' : {
      alias : 'verbose',
      type : 'boolean',
      default: false
    }
  }).argv;

var path = argv._ && argv._[0]

if (!path) {
  throw "No path";
}

glob(path, function(er, filenames) {
  if (argv.verbose) {
    console.error('[Files]', filenames.slice(0, 10), filenames.length > 10 ? '...' : '');
  }
  filenames.forEach(function(fname) {
    tokenize(fname, {verbose:argv.verbose});
  });
});
