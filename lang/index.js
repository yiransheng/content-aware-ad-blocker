#!/usr/bin/env node

var path = require('path');
var parse = require('./parse');

var argv = require('yargs')
  .command('parse [file]', 'parse a single js file')
  .help()
  .argv

if (argv._.length) {
  var filename = argv._[0];
  var scriptId = filename.replace(/\.js$/, '')
    .replace(/^.+\//, '');
  if (path.existsSync(filename)) {
    console.log("OK");
    /*
    parse(filename, function(err, data) {
      if (!err) {
        console.log(scriptId + '\t' + JSON.stringify(data));
      } else {
        console.error(err);
      }
    });
    */
  }
}
