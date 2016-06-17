#!/bin/bash

[ "$1" == "" ] && { echo "No platform provided!"; exit 1; }
INCLUDES="electrify-me node_modules LICENSE README.md"
EXCLUDES=""
if [ "$1" == "win32" ]; then
    INCLUDES="${INCLUDES} *.bat"
elif [ "$1" == "linux" ]; then
    INCLUDES="${INCLUDES} electrify"
    EXCLUDES="-x electrify-me/ext/imagemagick-windows/\*"
else
    echo "Platform untested!"
    exit 1
fi

set -x
npm install
version=$( cat package.json | grep "\version\"" |\
tr -d "\"" | tr -d "," | awk '{print $2}' )
target_file="electrify.me-v${version}-${1}.zip"
rm -f ${target_file}
zip -qr ${target_file} ${INCLUDES} \
-x node_modules/electron-prebuilt/node_modules/\* \
-x node_modules/electron-prebuilt/test/\* \
${EXCLUDES}
