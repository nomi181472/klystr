# Topology remote

This application produces the independently deployable Topology Module Federation container.

- Development: `npm run dev:topology-remote`
- Production build: `npm run build:topology-remote`
- Remote entry: `/_next/static/chunks/remoteEntry.js`
- Scope: `klystrTopology`
- Exposed module: `./Plugin`

The standalone page is a smoke-test host. In production the central shell mounts the exposed plugin and supplies the shell SDK plus the shared React Query provider. During migration, the shell falls back to its local Topology bundle if the remote cannot load.
