@echo off

if "%1"=="prod" (
   set NODE_ENV=production
   goto start
)

if "%1"=="dev" (
   set NODE_ENV=development
   goto start
)

echo Usage: run-server.bat [prod^|dev]
echo   prod - Run in production mode (HTTP on port 3000)
echo   dev  - Run in development mode (HTTPS on port 3443)
exit /b 1

:start
node server.js