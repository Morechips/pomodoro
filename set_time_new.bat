@echo off
setlocal

rem ============================================================
rem set_time_new.bat
rem ------------------------------------------------------------
rem Wrapper only:
rem - Delegate interactive menu and file update logic to PowerShell.
rem - This avoids CMD encoding issues when showing Chinese text.
rem ============================================================

if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_time_value.ps1" -Interactive
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_time_value.ps1" -Interactive -Minutes %~1
)
if errorlevel 1 (
  echo.
  echo [set_time_new.bat] Failed. See error message above.
  exit /b 1
)

exit /b 0
