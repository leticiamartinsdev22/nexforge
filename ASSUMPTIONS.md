# Assumptions

- The supported frontend mode is live-only: authenticated pages require the NexForge agent. When the agent is unreachable, the layout shows a connection state and does not render placeholder metrics.
- Browser verification uses test-only credentials and isolated ports; no credentials from local env files are used.
- Screenshots and Playwright outputs belong under ignored screenshots/, test-results/, or playwright-report/ directories.
- The real project root is nexforge/nexforge; the parent directory only contains that project.
- WSL cannot replace the Windows-backed node_modules directory because NTFS returns EACCES. Linux installs and tests may use a synchronized temporary clone; source corrections remain in the real project and are committed there.
