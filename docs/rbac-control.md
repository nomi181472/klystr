# RBAC control

The RBAC workspace manages Kubernetes `ServiceAccount` identities. Kubernetes does not store human `User` objects: EKS IAM principals, GKE identities, and AKS/Entra identities remain managed by their cloud provider. The grid creates klystr-owned Roles or ClusterRoles and their bindings using standard Kubernetes RBAC, so it remains portable across those providers.

Before any live mutation, the server sends `SelfSubjectAccessReview` requests equivalent to `kubectl auth can-i`. It checks the exact `create` or `update` operation plus the special `escalate` and `bind` verbs. When denied, the UI prints the corresponding commands an administrator can use to diagnose the missing access. Read failures such as 401 and 403 stop the operation; they are never treated as missing resources.

Tokens use the Kubernetes TokenRequest API, last ten minutes in the UI, are displayed once, and are never persisted. Configure `KLYSTR_TOKEN_AUDIENCE` when the cluster expects an audience other than `https://kubernetes.default.svc`.

`deploy/rbac-manager-rbac.yaml` is intentionally separate and opt-in because it allows klystr to delegate substantial access. Review it, change the bound ServiceAccount if needed, and apply it only in environments where this control plane is trusted. klystr-managed objects carry `app.kubernetes.io/managed-by: klystr`; externally managed accounts remain visible but read-only in the UI.
