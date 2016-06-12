@echo off

SET SCRIPT_PATH=%~dp0
SET ELECTRON=%SCRIPT_PATH:~0,-1%\node_modules\electron-prebuilt\dist\electron.exe
SET APP=%SCRIPT_PATH:~0,-1%\electrify-me

cd %SCRIPT_PATH%

echo SCRIPT   - %SCRIPT_PATH%
echo ELECTRON - %ELECTRON%
echo APP      - %APP%
echo COMMAND  - %ELECTRON% %APP% %*

start /D %SCRIPT_PATH% %ELECTRON% %APP% %*
exit 0
