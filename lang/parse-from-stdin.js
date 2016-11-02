#!/usr/bin/env node

var readline = require('readline');
var fs = require('fs');
var parse = require('./parse');
var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

var count = -1;
rl.on('line', function(line){
  var filename = line;
  var scriptId = filename.replace(/\.js$/, '')
    .replace(/^.+\//, '');
  if (fs.existsSync(filename)) {
    parse(filename, function(err, data) {
      if (!err) {
        count++;
        console.log(scriptId + '\t' + JSON.stringify(data));
      } else {
        console.error(err);
      }
      if (count % 100 == 0) {
        console.error("Parsed: " + (count+1) + " files.");
      }
    });
  }
});
