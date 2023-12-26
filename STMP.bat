@echo off
setlocal
pushd %~dp0

ECHO ===========================
ECHO SillyTavern MultiPlayer
ECHO ===========================

ECHO -- Checking/Installing Node Modules
call npm install --no-audit
title STMP
ECHO ===========================
ECHO -- Starting STMP server
node server.js
pause
popd