# Cloudflare Tunnel sharing

This mode shares the local Stock Dashboard over a temporary Cloudflare URL.

## How it works

```text
Other user's browser
-> Cloudflare temporary URL
-> Cloudflare Tunnel
-> This PC's Stock Dashboard server
```

There is no cloud server to rent. Your PC must stay powered on, and the tunnel window must stay open.

## Start sharing

Double-click:

```text
공유모드 실행하기.cmd
```

The first run downloads `cloudflared.exe` into:

```text
tools\cloudflared.exe
```

After a few seconds, the terminal prints a URL like:

```text
https://example-name.trycloudflare.com
```

Share that URL with other people.

Do not share addresses that start with:

```text
http://127.0.0.1
http://localhost
```

Those addresses work only on this PC. Other devices must use the `https://*.trycloudflare.com` URL. The script copies the public URL to your clipboard automatically when it appears.

## Security default

By default, this script starts the app with:

```text
STOCK_DASHBOARD_PUBLIC_WEB=1
```

That means Telegram login, Telegram search, and Telegram attachment download are locked for public sharing.

If you intentionally want Telegram available through the tunnel for your own private use, run:

```powershell
.\share_cloudflare_tunnel.ps1 -AllowTelegram
```

Only do this for trusted private access.

## Stop sharing

Close the tunnel window or press `Ctrl+C`.

## Notes

- The free quick tunnel URL is temporary and changes every time you start it.
- A fixed custom domain requires a Cloudflare account and a domain connected to Cloudflare.
- This does not slow down the normal local desktop app. It is a separate sharing mode.
