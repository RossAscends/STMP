#!/bin/bash

CreateNewIfMissing() {
    {
        echo "{"
        echo "   \"api_key_tabby\":\"$api_key\","
        echo "   \"sillytavern_basic_auth_string\":\"$auth_string\""
        echo "}"
    } > "$secrets"
    echo "$secrets created -- PUT YOUR TABBY API KEY AND SillyTavern BASIC AUTH CREDENTIALS IN THAT FILE AND RESTART THE SERVER"
    echo "==========================="
}

StartServer() {
    echo "-- Checking/Installing Node Modules"
    npm install --no-audit
    echo "Starting STMP server"
    node server.js
    read -p "Press Enter to continue..."
}

api_key="_YOUR_API_KEY_HERE_"
auth_string="_STUsername_:_STPassword_"
secrets="secrets.json"

echo "==========================="
echo "SillyTavern MultiPlayer"
echo "==========================="

# Check and create 'chats' folder if it doesn't exist
if [ ! -d "public/chats" ]; then
    mkdir -p "public/chats"
    if [ $? -ne 0 ]; then
        echo "Failed to create 'chats' folder. Check permissions or path."
        exit 1
    else
        echo "-- Created 'chats' folder."
    fi
fi

# Check and create 'api-presets' folder if it doesn't exist
if [ ! -d "public/api-presets" ]; then
    mkdir -p "public/api-presets"
    if [ $? -ne 0 ]; then
        echo "Failed to create 'api-presets' folder. Check permissions or path."
        exit 1
    else
        echo "-- Created 'api-presets' folder."
    fi
fi

echo "-- Looking for secrets.json...."

if [ -e "$secrets" ]; then
    echo "-- Found secrets.json!"
    echo "==========================="
    StartServer
else
    CreateNewIfMissing
fi



# Call the main function
StartServer
