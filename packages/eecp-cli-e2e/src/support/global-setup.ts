/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

export default async function () {
  // No global setup needed for CLI e2e tests
  // Each test starts its own server instance
  console.log('\nSetting up CLI e2e tests...\n');

  // Hint: Use `globalThis` to pass variables to global teardown.
  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down CLI e2e tests...\n';
}
