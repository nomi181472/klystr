import path from 'node:path';
import type { NextConfig } from 'next';
const root = path.resolve(__dirname, '../..');
const config: NextConfig = { output: 'standalone', outputFileTracingRoot: root, experimental: { externalDir: true }, async headers() { return [{ source: '/_next/static/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }]; }, webpack(current, { isServer, webpack }) { current.resolve.alias['@'] = root; if (!isServer) current.plugins.push(new webpack.container.ModuleFederationPlugin({ name: 'klystrSecurity', filename: 'static/chunks/remoteEntry.js', exposes: { './Plugin': path.resolve(__dirname, 'src/Plugin.tsx') }, shared: { react: { singleton: true, requiredVersion: false }, 'react-dom': { singleton: true, requiredVersion: false }, '@tanstack/react-query': { singleton: true, requiredVersion: false }, zustand: { singleton: true, requiredVersion: false } } })); return current; } };
export default config;
