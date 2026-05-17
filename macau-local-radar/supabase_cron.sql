-- Daily warm-up job for Macau Local Radar
-- Current backend target:
--   https://macau-market-api.onrender.com
--
-- Schedule note:
-- pg_cron commonly runs in UTC.
-- '10 22 * * *' means 22:10 UTC, which is 06:10 Asia/Hong_Kong on the next day.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('macau_market_daily_refresh')
where exists (
  select 1
  from cron.job
  where jobname = 'macau_market_daily_refresh'
);

select
  cron.schedule(
    'macau_market_daily_refresh',
    '10 22 * * *',
    $$
    select
      net.http_post(
        url := 'https://macau-market-api.onrender.com/api/internal/refresh-daily',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer macau-radar-7xK29pLmQ4sVn8aTz1wR5cHy'
        ),
        body := '{}'::jsonb
      );
    $$
  );
