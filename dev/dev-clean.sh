#!/bin/bash

rm -rf __electrified 2> /dev/null
rm *.desktop 2> /dev/null
rm *.lnk 2> /dev/null
rm *.zip 2> /dev/null
[ "$1" != "-n" ] && { 
echo "Removing node_modules. Keep with '-n'";
rm -rf node_modules 2> /dev/null
} || { echo "Skipping node_modules."; }
