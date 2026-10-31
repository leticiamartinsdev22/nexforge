# Assumptions

- The supported frontend mode is live-only: authenticated pages require the NexForge agent. When the agent is unreachable, the layout shows a connection state and does not render placeholder metrics.
- Browser verification uses test-only credentials and isolated ports; no credentials from local env files are used.
- Screenshots and Playwright outputs belong under ignored screenshots/, test-results/, or playwright-report/ directories.
- The real project root is nexforge/nexforge; the parent directory only contains that project.
- The active Windows Vite processes hold the workspace node_modules on ports 4173/4174; WSL could not replace it because of NTFS EACCES, and the Windows npm test lacked Vitest. Clean installs, lint/build and tests ran in a synchronized Temp mirror under WSL Ubuntu Node 20.20.2/npm 11.19.0. Using the Windows npm cache allowed both offline installs after the WSL cache missed why-is-node-running 2.3.0.
- The real Docker UI check used the local Unix socket and returned live containers; no containers were created, stopped, or modified by the checkup.
- Docker-unavailable tests used `DOCKER_HOST=tcp://127.0.0.1:1`; this only made the test agent fail to reach Docker and did not stop the user's Docker daemon.
- The isolated agent configuration has no `backups.command`; manual backup correctly remains disabled and returns `501 not_configured`. A real backup needs the intended command/path in the user's `server/config.json` and was not run against local data.
- Host log permission-denial behavior was not reproducible in the isolated WSL agent; Docker log access worked for the local test socket. A host-specific denied log source still needs a manual check under that account.
- Windows reports Node 24.18.0/npm 11.16.0, but its workspace node_modules was not replaced. An offline ESLint 8 install was blocked by uncached brace-expansion 1.1.16; the configured npm run lint uses Oxlint. The registry lookup did not respond during the checkup, so ESLint itself was not run.
- Browser screenshots were taken at 375, 768 and 1440 CSS pixels on pages with live local Docker data; no screenshot reference files were supplied for visual comparison.
