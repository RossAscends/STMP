@echo off
pushd %~dp0

IF EXIST secrets.json ECHO Found secrets.json!
CALL :CreateNewIfMissing secrets.json

:CreateNewIfMissing
echo {"api_key_tabby":"_YOUR_API_KEY_HERE_"} > secrets.json

call npm install --no-audit
node server.js
pause
popd