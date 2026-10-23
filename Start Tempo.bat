@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this computer.
  echo Install Node.js from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo Installing dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo.
    echo Could not install dependencies. Run "npm install" in this folder.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  if exist ".env.example" (
    echo.
    echo No .env file found. Copying .env.example to .env.
    copy /Y ".env.example" ".env" >nul
    echo Edit .env if your MySQL username or password is different.
    echo.
  )
)

echo Make sure MySQL is running in the XAMPP Control Panel.
echo.

node serve.js
if errorlevel 1 pause
