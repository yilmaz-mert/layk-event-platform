// Minimal ambient declaration so TypeScript is satisfied in browser-typed
// environments (Vite, jsdom). Metro (Expo) inlines process.env.EXPO_PUBLIC_*
// statically at build time regardless of whether this declaration exists.
declare const process: { env: Record<string, string | undefined> } | undefined;
