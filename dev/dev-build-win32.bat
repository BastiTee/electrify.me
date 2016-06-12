@echo off

rem echo Resolving dependencies...
npm install -g electron-packager
npm install 

echo Preparing build environment...
mkdir build
rmdir /s /q build\electrify-me-win32-x64

echo Creating package...
electron-packager ./ electrify-me --platform=win32 --arch=x64 --overwrite --out build ^
--ignore=^[^\\]*\.bat$ ^
--ignore=^[^\\]*\.zip$ ^
--ignore=^.*sublime.*$ ^
--ignore=^.*README.md.*$ ^
--ignore=^.*favicon_http.*$ ^
--ignore=^dev.*$ ^
