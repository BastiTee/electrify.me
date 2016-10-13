@ECHO off

SET SCRIPT_PATH=%~dp0
SET ELECTRON=%SCRIPT_PATH:~0,-1%\node_modules\electron\dist\electron.exe
SET APP=%SCRIPT_PATH:~0,-1%\electrify-me

CD %SCRIPT_PATH%

IF NOT EXIST %ELECTRON% (
	ECHO Electron not yet installed. Will run npm...
	CALL npm install
) 

ECHO SCRIPT   - %SCRIPT_PATH%
ECHO ELECTRON - %ELECTRON%
ECHO APP      - %APP%
ECHO COMMAND  - %ELECTRON% %APP% %*

START %ELECTRON% %APP% %*
