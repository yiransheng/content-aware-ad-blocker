#!/bin/bash


for i in $(ls -l $1*.js | awk '{ print $9 }' | grep js) 
do
# throw away stderr
  ./index.js $i 2>/dev/null
done
