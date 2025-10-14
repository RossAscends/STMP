if command -v cloudflared &> /dev/null
then
    cloudflared tunnel --url localhost:8182
else
    echo "cloudflared could not be found, install it via your package manager"
    exit 1
fi
