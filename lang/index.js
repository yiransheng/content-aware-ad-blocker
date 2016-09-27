#!/usr/bin/env node

var parse = require('./parse');

var argv = require('yargs')
  .command('parse [file]', 'parse a single js file')
  .help()
  .argv

if (argv._.length) {
  parse(argv._[0], function(err, data) {
    if (!err) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error(err);
    }
  });
}
