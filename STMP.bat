@echo off
pushd %~dp0

ECHO ===========================
ECHO SillyTavern MultiPlayer
ECHO ===========================

ECHO -- Looking for secrets.json....

IF EXIST secrets.json ECHO Found secrets.json!
ECHO ===========================
IF EXIST secrets.json GOTO StartServer
CALL :CreateNewIfMissing secrets.json

:CreateNewIfMissing
echo {"api_key_tabby":"_YOUR_API_KEY_HERE_"} > secrets.json
echo secrets.json created -- PUT YOUR TABBY API KEY IN HERE AND RESTART THE SERVER
ECHO ===========================

:StartServer
ECHO -- Checking/Installing Node Modules
call npm install --no-audit
ECHO ===========================
ECHO -- Starting STMP server
node server.js
pause
popd