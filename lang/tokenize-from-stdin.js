#!/usr/bin/env node
var esprima = require('esprima');

var readline = require('readline');
var fs = require('fs');
var parse = require('./parse');
var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

var TOKEN_TYPES = {
  'Boolean' : 1,
  'Identifier' : 2,
  'Keyword' : 3,
  'Null' : 4,
  'Numeric' : 5,
  'Punctuator' : 6,
  'String' : 7,
  'RegularExpression' : 8,
  'Template' : 9
}

var count = -1;
rl.on('line', function(line){
  var filename = line;
  var scriptId = filename.replace(/\.js$/, '')
    .replace(/^.+\//, '');
  if (fs.existsSync(filename)) {
    count++;
    try {
      var content = fs.readFileSync(filename).toString();
      var tokens = esprima.tokenize(content);
      tokens.forEach(t => {
        switch (t.type) {
          case 'Punctuator':
          case 'Numeric':
          case 'Template':
          case 'RegularExpression':
            delete t.value
          case 'String':
            if (t.value && t.value.length > 50) {
              delete t.value;
            } else if (t.value && !/\s/g.test(t.value)) {
              t.value = t.value.replace(/^(\'|\")/, '').replace(/(\'|\")$/, '');
            } else {
              delete t.value;
            }
          default:
            break;
        }
        t.type = TOKEN_TYPES[t.type];
        if (typeof t.type === 'undefined') {
          t.type = 0;
        }
      });
      tokens = tokens.map(({type, value}) => {
        if (value) {
          return value + '|' + type;
        } else {
          return type.toString();
        }
      });
      console.log(scriptId + '\t' + JSON.stringify(tokens));
    } catch (err) {
      console.error('[Tokenizing Error]', err);
    }
    if (count % 100 == 0) {
      console.error('Line: ' + count);
    }

  }
});
rl.on("end", ()=> {
  console.log("Total Lines: " + count);
});
