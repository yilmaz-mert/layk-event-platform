/// <reference types="nativewind/types" />

// Allow TypeScript to accept CSS side-effect imports (e.g. `import './global.css'`).
// Metro / NativeWind transforms these at build time; TS only needs to not error.
declare module '*.css' {}
