module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource tells Babel to use NativeWind's JSX transform so that
      // className props on React Native primitives are processed at compile time.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
