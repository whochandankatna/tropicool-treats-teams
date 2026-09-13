> Historical pre-deployment notes. The release went live on 13 September 2026. See `README.md` for current status and the migration filename in `supabase/migrations/`.

# Clock-out reminders and 200 m clock-in location gate

Source basis: the live-matching Claude `source-code` snapshot and the downloaded current `make-server-3ba8d4df` Edge Function. This candidate is isolated from that source folder.

Sample interface preview: https://clockout-location-review--tropicooltreatsteam.netlify.app/

The preview mounts only the new Staff clock, Clock-out reviews, and Location panels. All actions in that preview use sample data. It sends no push notifications and changes no Square timecards or live store settings.

## Behaviour prepared for release

- Published Square roster shifts with open Square timecards trigger device push reminders at 10 minutes before rostered end, at end, and 30 minutes after. The worker records each reminder once per shift and does not write to the app's notification bell.
- At rostered end plus one hour, the worker closes the still-open Square timecard at that exact cutoff, closes an open break, updates local clock status, records a private review, and pushes verified manager devices only.
- A manager can approve the automatic finish or enter the verified actual finish with a reason. A correction updates Square and keeps the original automatic time and reviewer in the review record. Staff receive no approval-system message.
- The manager review screen separates items needing action from a read-only history of completed decisions. If Square rejects an automatic closure, the manager corrects the timecard in Square first and records the resolution in the app.
- The manager Location tab controls a fixed 200 m clock-in radius. The server checks reported position and accuracy. Missing or uncertain location fails closed for staff and requires an explicit manager override. Managers are exempt.
- When that switch is off, clock-in does not wait for a browser location reading.
- Manager push subscriptions must be verified with that manager's own PIN. New review pushes are restricted to verified manager devices.
- Staff reminder pushes use a five-minute delivery lifetime; a phone that reconnects hours later will not show an obsolete clock-out reminder.

## Release sequence

1. Confirm that the 200 m rule applies to shift **Clock In**, as assumed here.
2. Review the sample interface and complete an operational dry run with a current published roster and open Square timecard. Test iPhone Home Screen push and an Android device with opted-in notifications.
3. Apply `supabase/migrations/20260912000000_clockout_reviews_and_geofence_security.sql`. This adds review/audit tables and the server-only scheduler secret. It does not schedule the worker or enable geofencing.
4. Deploy the Edge Function from `supabase/functions/make-server-3ba8d4df/`, then deploy the normal frontend build. The existing geofence row remains off until a manager turns it on.
5. Have a manager sign in with their own PIN on a phone and enable notifications. Check that at least one verified manager subscription exists. Run the worker in `dry-run` mode with its server-only key, compare candidates with Square, and verify no historical/open timecard is incorrectly selected.
6. Run `supabase/release/activate-clockout-cron.sql` only after those checks. `supabase/release/deactivate-clockout-cron.sql` is the immediate stop switch.

No production migration, Edge Function deployment, cron activation, or live Netlify deployment has been performed in this draft.

## Verification completed

- React TypeScript check and normal Vite production build pass.
- Deno Edge Function type check passes.
- Five Deno tests pass for reminder windows, timecard matching, break preservation, geofence failure cases, and actual-finish validation. The Square scheduled-shift search uses its documented 50-record page limit.
- The sample preview was checked at desktop and a 390 px viewport with no horizontal overflow.
- The full draft app was checked locally at a 390 px viewport: Manager → Staff → Clock-outs and Manager → Settings → Geolocation are both reachable through the mobile section controls.
- The live Netlify asset remained `index-ZET_ukO1.js` after the sample preview deploy.

## Operational limits

- iPhone web push requires the app to be installed on the Home Screen and notifications to be allowed. See Apple's Web Push documentation: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- A manager who opens the app with Face ID or a restored profile must enter their PIN once on the Manager tab. This makes the server-side review, location switch and manager push subscription verifiable without additional PIN prompts in the subsections.
- Browser geolocation is reported by the device and can be spoofed. This is a practical location gate, not tamper-proof attendance evidence.
- Automatic matching accepts a timecard started within two hours of the roster start. A much later start is left for manual review rather than risking the closure of a different shift.
- Square rejects a timecard correction if the version changed or the corrected finish conflicts with recorded break details. In that case the manager must review Square manually; this app does not overwrite someone else's correction.
