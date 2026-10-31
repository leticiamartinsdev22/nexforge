# Assumptions

- The supported frontend mode is live-only: authenticated pages require the NexForge agent. When the agent is unreachable, the layout shows a connection state and does not render placeholder metrics.
- Browser verification uses test-only credentials and isolated ports; no credentials from local env files are used.
- Screenshots and Playwright outputs belong under ignored screenshots/, test-results/, or playwright-report/ directories.
- The real project root is nexforge/nexforge; the parent directory only contains that project.
- The real workspace node_modules is used by Windows Vite processes on ports 4173/4174; WSL received NTFS EACCES when it tried to replace it, and the existing Windows `npm test` lacked the Vitest executable. I used a synchronized Temp mirror for clean installs, lint/build and root `npm test`, then committed all source changes in the real repository. The WSL default npm cache first lacked `why-is-node-running@2.3.0` (`ENOTCACHED`); using the Windows npm cache read-only allowed clean offline Linux installs of both lockfiles.
- The real Docker UI check used the local Unix socket and returned live containers; no containers were created, stopped, or modified by the checkup.
- Docker-unavailable tests used `DOCKER_HOST=tcp://127.0.0.1:1`; this only made the test agent fail to reach Docker and did not stop the user's Docker daemon.
- The isolated agent configuration has no `backups.command`; manual backup correctly remains disabled and returns `501 not_configured`. A real backup needs the intended command/path in the user's `server/config.json` and was not run against local data.
- Host log permission-denial behavior was not reproducible in the isolated WSL agent; Docker log access worked for the local test socket. A host-specific denied log source still needs a manual check under that account.
- WSL `npm ci --offline` could not fetch an uncached `why-is-node-running@2.3.0` tarball (`ENOTCACHED`). A clean Windows Node 24.18.0/npm 11.16.0 install passed in the synchronized Temp mirror; the original Windows-backed workspace `node_modules` could not be replaced due NTFS `EACCES`.
- Browser screenshots were taken at 375, 768 and 1440 CSS pixels on pages with live local Docker data; no screenshot reference files were supplied for visual comparison.
