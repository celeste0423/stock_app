# Muse VM deployment

This package installs the stock leader API, Telegram command bot, and market-close delivery timers on a persistent Linux VM.

## What is downloaded

The installer uses Git sparse checkout. It downloads only the runtime paths from this repository:

- `backend`
- `config`
- `deploy/muse`
- `frontend/static`
- `tools`
- root files such as `requirements.txt`

Generated SQLite databases and bot delivery state remain on the VM and are not committed.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/celeste0423/stock_app/main/deploy/muse/install.sh -o /tmp/install-stock-leader.sh
sudo bash /tmp/install-stock-leader.sh
sudo /opt/stock-leader/app/deploy/muse/configure.sh
```

`configure.sh` prompts for the Telegram bot token, allowed chat IDs, formula sync token, and bind host. Secrets are stored in `/etc/stock-leader.env` with mode `0600`.

The default API bind address is `127.0.0.1`. Use a private-network address or a firewall-protected `0.0.0.0` only when remote score-formula push is required.

## Schedules

- Korea: weekdays at 16:20 `Asia/Seoul`
- United States: weekdays at 17:15 `America/New_York`

The US timer follows daylight-saving time automatically. Each delivery is keyed by market and data date, so restarting a timer does not resend a completed report. Market holidays reuse the last data date and are skipped as already delivered.

## Manual verification

```bash
sudo systemctl start stock-muse-close@kr.service
sudo journalctl -u stock-muse-close@kr.service -n 100 --no-pager

sudo systemctl start stock-muse-close@us.service
sudo journalctl -u stock-muse-close@us.service -n 100 --no-pager

sudo systemctl list-timers 'stock-muse-close-*'
```

Use `--force` only for an intentional resend:

```bash
sudo -u stockleader /opt/stock-leader/venv/bin/python \
  /opt/stock-leader/app/tools/muse_market_close_job.py \
  --market kr --force
```

## Update

```bash
sudo /opt/stock-leader/app/deploy/muse/update.sh
```

The update is fast-forward only. It preserves generated databases, `/etc/stock-leader.env`, and `/var/lib/stock-leader` state.

## Formula synchronization

The running app keeps the existing score-formula synchronization endpoints. Configure the local app with the Muse VM URL and the same token stored as `ORACLE_SCORE_SYNC_TOKEN` on the VM. The legacy environment variable name is retained for compatibility.

For a private Tailscale address, for example:

```env
ORACLE_STOCK_APP_URL=http://MUSE_TAILSCALE_IP:8124
ORACLE_SCORE_SYNC_TOKEN=the-same-token-from-configure
```

Formula parameter changes can then be pushed without updating the application code. Python calculation changes still require a Git deployment through `update.sh`.
