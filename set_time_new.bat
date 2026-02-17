@echo off
setlocal

rem ============================================================
rem set_time_new.bat
rem ------------------------------------------------------------
rem Features:
rem 1) no args     -> interactive menu (minutes + sound switch)
rem 2) number arg  -> quick set minutes (example: set_time_new.bat 50)
rem 3) sound arg   -> set_time_new.bat sound on|off
rem
rem Notes:
rem - Real logic lives in set_time_value.ps1.
rem - This bat only forwards parameters.
rem ============================================================

if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_time_value.ps1" -Interactive
  goto :after
)

if /I "%~1"=="help" goto :usage
if /I "%~1"=="/?" goto :usage
if /I "%~1"=="-h" goto :usage

if /I "%~1"=="sound" (
  if /I "%~2"=="on" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_time_value.ps1" -Interactive -Sound on
    goto :after
  )
  if /I "%~2"=="off" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_time_value.ps1" -Interactive -Sound off
    goto :after
  )
  goto :usage
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_time_value.ps1" -Interactive -Minutes %~1
goto :after

:usage
echo.
echo Usage:
echo   set_time_new.bat
echo   set_time_new.bat 90^|50^|25^|customNumber
echo   set_time_new.bat sound on
echo   set_time_new.bat sound off
echo.
echo Notes:
echo   90 min: long sessions (coding/writing)
echo   50 min: medium sessions (class/listening)
echo   25 min: short tasks (homework)
exit /b 1

:after
if errorlevel 1 (
  echo.
  echo [set_time_new.bat] Failed. See error message above.
  exit /b 1
)

exit /b 0
