@echo off
title RIRI PC AGENT
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 ( py riri-agent.py & goto done )

where python >nul 2>nul
if %errorlevel%==0 ( python riri-agent.py & goto done )

echo.
echo  Python is not installed on this PC.
echo  Get it FREE from  https://www.python.org/downloads/
echo  During install, TICK the box "Add python.exe to PATH",
echo  then double-click this file again.
echo.

:done
pause
