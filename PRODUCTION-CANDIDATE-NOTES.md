> Historical pre-deployment notes. The current production baseline is documented in `README.md`.

# Production candidate

This build uses the existing Supabase project and current operational data. It has not been published to the live Netlify URL.

The reviewed responsive, mobile navigation, accessibility, Brisbane date and save-error improvements are included. Overview, Stock Levels, Team and Manager use the full desktop width, staff-facing content is explicitly stretched on every main tab, and finance charts expand to fill their panels. Mobile navigation exposes every Manager subpage, including Staff Directory, Roster, Swaps and Time Off. The Manager navigation is fixed flush to the bottom edge on phones, fills the safe area, and no longer adds a second block of page-bottom spacing. The app remembers the signed-in staff profile on that device until Switch user is selected. It stores the profile ID only; manager authorisation and PINs are not retained after a full restart. One verified manager PIN is reused by protected Manager subsections for the current browser session and cleared on lock or profile switch. Finance presets and date fields stay within the viewport at 360, 390 and 409 px. Clock-in and clock-out now show pending and confirmed animation states, and failed confirmation restores the prior clock state. Staff-facing pay estimates use a 15% conservative adjustment; manager figures and stored payroll data are unchanged. The opening message remains visible for at least 2.4 seconds, and dynamic viewport sizing prevents an exposed strip below the app on iPhone.

Database permission and server authentication changes are outside this build and require a coordinated migration.
