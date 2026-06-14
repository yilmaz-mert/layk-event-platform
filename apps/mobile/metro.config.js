const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// --- Turborepo / npm workspace support ---
// Metro only watches the project folder by default; add workspace root so it
// can resolve symlinked packages (e.g. @layk/core -> packages/core).
config.watchFolders = [workspaceRoot];

// Tell Metro where to look for node_modules:
// 1. apps/mobile/node_modules  (local overrides, if any)
// 2. root node_modules          (hoisted workspace packages)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Prevent Metro from stripping the .ts / .tsx extensions of workspace source.
config.resolver.sourceExts = [
  ...(config.resolver.sourceExts ?? []),
  'mjs',
  'cjs',
];

// --- NativeWind CSS transform ---
module.exports = withNativeWind(config, {
  input: './global.css',
  inlineRem: 16,
});
