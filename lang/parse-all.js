#!/usr/bin/env node

var fs = require("fs");
var parse = require('./parse');

var succeeded = 0;
var failed = 0;

var deferParse = function(items) {
    if (items.length == 0) {
        console.log("Done! Succeeded: " + succeeded + ", failed: " + failed);
        return;
    }
    setTimeout(function() { doParse(items[0], items.slice(1))}, 0);
}

var doParse = function(item, remainingItems) {
    fs.exists("/usr/src/app/scripts-ast/" + item + ".js.ast", function(exists) {
        if (exists) {
            console.log(item + " (exists)");
            succeeded += 1;
            deferParse(remainingItems);
            return;
        }
        console.log(item);
        parse("/usr/src/app/scripts/" + item + ".js", function(err, data) {
            if (!err) {
                fs.writeFile("/usr/src/app/scripts-ast/" + item + ".js.ast",
                    JSON.stringify(data),
                    function(err) {
                        if(err) {
                            console.error(err);
                            failed += 1;
                        } else {
                            succeeded += 1;
                        }
                        deferParse(remainingItems);
                    });
            } else {
                console.error(err);
                failed += 1;
                deferParse(remainingItems);
            }
        });
    });
}

fs.readFile("/usr/src/app/scripts/table_balanced.json", function(err, data) {
    var table = JSON.parse(data);
    var items = table.map(function(item) { return item.sha; });
    items.sort();
    deferParse(items);
});
