#!/bin/bash


for i in `find $1 -type f -name '*.js'`
do
# throw away stderr
./index.js $i 2>/dev/null
done
