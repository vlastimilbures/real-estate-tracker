# Security policy

Real Estate Tracker is an offline desktop app: it makes no network calls and keeps all data in
local files readable only by your user. Security issues are still taken seriously — for
example a way to make the webview load remote content, read files outside the app's folder,
or corrupt a database through a crafted CSV or backup file.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through
[GitHub security advisories](https://github.com/vlastimilbures/real-estate-tracker/security/advisories/new)
with steps to reproduce and the app version (Settings → About).

You can expect an acknowledgement within a week. Fixes ship in the next release, and the
advisory is published once a fixed version is available.

## Supported versions

Only the latest release receives fixes.
