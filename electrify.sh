#!/bin/sh

SCRIPT_PATH=$( dirname $( readlink -f $0 ))
ELECTRON=${SCRIPT_PATH}/node_modules/electron-prebuilt/dist/electron
APP=${SCRIPT_PATH}/electrify-me

cd ${SCRIPT_PATH}

if [ ! -f ${ELECTRON} ]; then
    echo "Electron not yet installed. Will run npm..."
    npm install
fi

echo "SCRIPT   - $SCRIPT_PATH"
echo "ELECTRON - $ELECTRON"
echo "APP      - $APP"
echo "COMMAND  - $ELECTRON $APP $@"

$ELECTRON --enable-transparent-visuals --disable-gpu $APP $@ &
