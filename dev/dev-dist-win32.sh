#!/bin/bash

set -x
npm install
version=$( cat package.json | grep "\version\"" |\
tr -d "\"" | tr -d "," | awk '{print $2}' )
target_file="electrify.me-v${version}-win32.zip"
rm -f ${target_file}
zip -qr ${target_file} electrify-me node_modules *.bat LICENSE README* -x node_modules/electron-prebuilt/node_modules/\* -x node_modules/electron-prebuilt/test/\*
