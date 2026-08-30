import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.container.ModuleFederationPlugin({
          name: 'ssShell',
          shared: {
            // Publish host-owned modules under explicit provider requests. Using
            // `react` itself as the config key also turns every Next client import
            // into a federation consumer, which is incompatible with the App
            // Router's synchronous bootstrap. The distinct keys keep shell imports
            // native while `shareKey` exposes the instances expected by remotes.
            shellReact: { import: 'react', shareKey: 'react', singleton: true, requiredVersion: false, version: '19.2.8', eager: true },
            shellReactDom: { import: 'react-dom', shareKey: 'react-dom', singleton: true, requiredVersion: false, version: '19.2.8', eager: true },
            shellReactQuery: { import: '@tanstack/react-query', shareKey: '@tanstack/react-query', singleton: true, requiredVersion: false, eager: true },
            shellZustand: { import: 'zustand', shareKey: 'zustand', singleton: true, requiredVersion: false, eager: true },
          },
        }),
      );
    }

    return config;
  },
};

export default nextConfig;
