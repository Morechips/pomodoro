@echo off
setlocal

rem Launch index.html with Chromium autoplay policy to allow WebAudio on page open.
rem Use only on your own machine.
rem
rem Browser selection:
rem   open.bat            -> default Edge
rem   open.bat edge       -> force Edge
rem   open.bat chrome     -> force Chrome
rem   open.bat default    -> system default browser

set "PAGE=%~dp0index.html"
if not exist "%PAGE%" (
  echo [open.bat] index.html not found: "%PAGE%"
  exit /b 1
)

set "PAGE_URL=file:///%PAGE:\=/%"
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=edge"
if /I "%TARGET%"=="help" goto :usage
if /I "%TARGET%"=="/?" goto :usage
if /I "%TARGET%"=="-h" goto :usage

set "CHROME_EXE="
for %%I in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if exist %%~I set "CHROME_EXE=%%~I"
)

set "EDGE_EXE="
for %%I in (
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
) do (
  if exist %%~I set "EDGE_EXE=%%~I"
)

if /I "%TARGET%"=="edge" goto :launch_edge
if /I "%TARGET%"=="chrome" goto :launch_chrome
if /I "%TARGET%"=="default" goto :launch_default
goto :usage

:launch_edge
if defined EDGE_EXE (
  start "" "%EDGE_EXE%" --autoplay-policy=no-user-gesture-required --new-window "%PAGE_URL%"
  exit /b 0
)
if defined CHROME_EXE (
  start "" "%CHROME_EXE%" --autoplay-policy=no-user-gesture-required --new-window "%PAGE_URL%"
  exit /b 0
)
goto :launch_default

:launch_chrome
if defined CHROME_EXE (
  start "" "%CHROME_EXE%" --autoplay-policy=no-user-gesture-required --new-window "%PAGE_URL%"
  exit /b 0
)
if defined EDGE_EXE (
  start "" "%EDGE_EXE%" --autoplay-policy=no-user-gesture-required --new-window "%PAGE_URL%"
  exit /b 0
)
goto :launch_default

:launch_default
rem Fallback: open with system default browser (autoplay may still be blocked).
start "" "%PAGE%"
exit /b 0

:usage
echo Usage:
echo   open.bat [edge^|chrome^|default]
echo.
echo Examples:
echo   open.bat
echo   open.bat edge
echo   open.bat chrome
echo   open.bat default
exit /b 1
