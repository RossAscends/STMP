@echo off
echo ========================================================================================================================
echo WARNING: Cloudflare Tunnel!
echo ========================================================================================================================
echo This script will: 
echo 1. Download and run the latest cloudflared.exe (57MB) from Cloudflare's github
echo 2. Generate a randomly-named HTTPS tunnel to your SillyTavern Multiplayer (STMP) host server.
echo 
echo Anyone who knows the tunnel URL will be able to access your STMP server.
echo.
echo By continuing you confirm that you're aware of the potential dangers of having a tunnel open 
echo and take all responsibility to properly use and secure it!
echo.
echo To abort, press Ctrl+C or close this window now!
echo.
echo Otherwise...
pause
if not exist cloudflared.exe curl -Lo cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
cloudflared.exe tunnel --url localhost:8182
