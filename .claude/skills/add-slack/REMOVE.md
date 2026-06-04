# Remove Slack

1. Comment out `import './slack.js'` in `src/channels/index.ts`
2. Remove `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` from `.env`
3. `pnpm uninstall @slack/socket-mode @slack/web-api slackify-markdown`
4. Rebuild and restart
