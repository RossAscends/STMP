@echo off
setlocal
pushd %~dp0

set "api_key=_YOUR_API_KEY_HERE_"
set "auth_string=_STUsername_:_STPassword_"
set "secrets=secrets.json"

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
(
    echo {
    echo    "api_key_tabby":"%api_key%",
    echo    "sillytavern_basic_auth_string":"%auth_string%"
    echo }
 ) > "%secrets%"
echo %secrets% created -- PUT YOUR TABBY API KEY AND SillyTavern BASIC AUTH CREDENTIALS IN THAT FILE AND RESTART THE SERVER
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