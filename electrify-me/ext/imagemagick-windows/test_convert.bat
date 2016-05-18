@echo off
echo Converting JPEG
convert.exe -verbose photo.jpg -resize 300 out.jpg
if errorlevel 1 (
   echo Failure Reason Given is %errorlevel%
   pause
   exit /b %errorlevel%
) else (
	del out.jpg
)
echo Converting PNG
convert.exe -verbose  photo.png -resize 300 out.png
if errorlevel 1 (
   echo Failure Reason Given is %errorlevel%
   pause
   exit /b %errorlevel%
) else (
	del out.png
)
echo Converting GIF 
convert.exe -verbose photo.gif -resize 300 out.gif
if errorlevel 1 (
   echo Failure Reason Given is %errorlevel%
   pause
   exit /b %errorlevel%
) else (
	del out.gif
)
echo fin.