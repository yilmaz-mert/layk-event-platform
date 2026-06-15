const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Force critical singleton modules to resolve to a single physical copy at the
// workspace root. Without this, Metro picks up a second local copy whenever npm
// workspace installs diverge (version mismatch → local install), which breaks
// React's hook invariant ("Invalid hook call / useState of null").
config.resolver.extraNodeModules = {
  'react': path.resolve(workspaceRoot, 'node_modules/react'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(workspaceRoot, 'node_modules/react-native'),
  'react-native-safe-area-context': path.resolve(workspaceRoot, 'node_modules/react-native-safe-area-context'),
  '@layk/core': path.resolve(workspaceRoot, 'packages/core'),
};

// Watch the monorepo root so Metro sees symlinked workspace packages.
config.watchFolders = [workspaceRoot];

// Resolution order: local overrides first, then hoisted workspace packages.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Keep .mjs / .cjs so workspace TypeScript source resolves correctly.
config.resolver.sourceExts = [
  ...(config.resolver.sourceExts ?? []),
  'mjs',
  'cjs',
];

module.exports = withNativeWind(config, { input: './global.css', inlineRem: 16 });
