# Topology scaling

The topology uses progressive discovery instead of rendering the entire cluster:

1. List namespaces only (`kubectl get namespaces`).
2. Render unloaded namespace boundaries.
3. Load selected resource kinds for one namespace with namespaced API calls (for example, `kubectl get pods,services,ingresses -n payments`).
4. Merge that namespace into the current graph without replacing unaffected React Flow entities or resetting the viewport.

Pods are grouped under their Kubernetes Node and then namespace. Resources that are not scheduled to Nodes, such as Deployments, Services, and Ingresses, are placed under **Logical resources**, then grouped by namespace and kind. This avoids incorrectly claiming that a Deployment belongs to one worker Node.

Metrics are off by default. Each loaded namespace boundary has its own Metrics toggle, backed by the namespaced `pods.metrics.k8s.io` endpoint (equivalent to `kubectl top pods -n <namespace>`). Toggling one namespace patches only Pods in that namespace.

Namespaced list calls are capped per resource kind so an accidental broad selection cannot put 10,000 objects into one canvas. Configure the production cap with:

```env
TOPOLOGY_RESOURCE_LIMIT_PER_KIND=300
```

The accepted range is 1–1000. When Kubernetes returns a continuation token, klystr shows a warning that the boundary is truncated. Users should narrow namespace and resource-type selection instead of expanding a 10,000-node canvas.
