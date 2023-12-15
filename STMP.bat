@echo off
pushd %~dp0

ECHO ===========================
ECHO SillyTavern MultiPlayer
ECHO ===========================

REM Check and create 'chats' folder if it doesn't exist
IF NOT EXIST "public/chats" (
    mkdir public/chats
    ECHO -- Created 'chats' folder.
)

REM Check and create 'api-presets' folder if it doesn't exist
IF NOT EXIST "public/api-presets" (
    mkdir public/api-presets
    ECHO -- Created 'api-presets' folder.
)

ECHO -- Looking for secrets.json....

IF EXIST secrets.json (
    ECHO -- Found secrets.json!
    ECHO ===========================
    GOTO StartServer
) ELSE (
    CALL :CreateNewIfMissing secrets.json
)



:CreateNewIfMissing
echo {"api_key_tabby":"_YOUR_API_KEY_HERE_"} > secrets.json
echo secrets.json created -- PUT YOUR TABBY API KEY IN HERE AND RESTART THE SERVER
ECHO ===========================

:StartServer
ECHO -- Checking/Installing Node Modules
call npm install --no-audit
title STMP
ECHO ===========================
ECHO -- Starting STMP server
node server.js
pause
popd