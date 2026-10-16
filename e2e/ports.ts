// Ports for the servers e2e/servers.ts starts. Each browser gets its own online
// server (and database) so its leaderboard assertions don't see other browsers' runs.
export const LOCAL_PORT = 4181;
export const ONLINE_PORTS: Record<string, number> = { chromium: 4182, firefox: 4183, webkit: 4184 };
