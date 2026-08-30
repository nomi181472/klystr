# Image Analysis production configuration

Live analysis creates one constrained Kubernetes Job per image and reads Trivy's JSON report from the completed Pod log. The client cannot provide commands or scanner flags. Only images in the server-discovered Pod inventory are accepted.

## Required configuration

```bash
KLYSTR_PROJECT_NAME=klystr
IMAGE_VERIFICATION_SECRET=replace-with-at-least-32-random-characters
TRIVY_SERVICE_ACCOUNT=klystr-scanner
TRIVY_IMAGE=ghcr.io/aquasecurity/trivy:0.74.0
IMAGE_SCAN_TIMEOUT_SECONDS=600
IMAGE_SCAN_JOB_TTL_SECONDS=86400
IMAGE_SCAN_MAX_CONCURRENT=2
IMAGE_SCAN_MAX_REPORT_BYTES=8000000
IMAGE_SCAN_MAX_FINDINGS=5000
TRIVY_CPU_LIMIT=1
TRIVY_MEMORY_LIMIT=1Gi
TRIVY_CPU_REQUEST=25m
TRIVY_MEMORY_REQUEST=128Mi
```

Before starting an analysis, the user can override all four Job quantities (CPU request, memory request, CPU limit, and memory limit). The Route Handler validates Kubernetes quantity syntax and rejects requests greater than limits. Choosing **unconstrained** omits the container `resources` field entirely; it does not write zero-valued requests or limits. Environment values above are the constrained defaults when a caller does not provide explicit values.

klystr sanitizes `KLYSTR_PROJECT_NAME` as an RFC 1123 DNS label and uses it as the only namespace for Jobs, scanner support resources, and the `verified-images` ConfigMap. Apply `deploy/image-scanner-rbac.yaml` after replacing every `klystr` namespace/name with the configured project name and changing the bindings to the klystr server identity. The scanner ServiceAccount itself receives no Kubernetes API permissions and its token is not mounted.

Before creating a scan record or Job, klystr verifies the controller's required access with SelfSubjectAccessReviews. The Next.js Route Handler reads or creates the project-scoped `TRIVY_SERVICE_ACCOUNT` with token automount disabled, then confirms configured registry/image-pull Secrets exist. The response streams each real apply/check step to the Inspect panel. Missing dependencies fail immediately with remediation text instead of leaving the UI queued. Job failure conditions, Job and Pod Warning events, unschedulable Pods, deadline expiry, failed Pods, and fatal container waiting reasons such as `ImagePullBackOff` are surfaced in the Inspect panel.

Verified identities are stored under the ConfigMap `verified-images`, key `verified_images.json`. Each 64-character identity key is signed with HMAC-SHA256 using `IMAGE_VERIFICATION_SECRET`. Rotating this secret intentionally marks existing records critical until images are inspected and verified again. Keep the secret stable and supply it through a Secret manager; it is never written to the ConfigMap.

For a private target registry, create a `kubernetes.io/dockerconfigjson` Secret in the `KLYSTR_PROJECT_NAME` namespace and set `TRIVY_REGISTRY_SECRET` to its name. For a private mirror containing the Trivy scanner image, set `TRIVY_JOB_IMAGE_PULL_SECRET`. These are separate concerns: `imagePullSecrets` lets kubelet pull the scanner container, while `TRIVY_REGISTRY_SECRET` lets Trivy authenticate to the target registry.

## Provider checks

- EKS/ECR: nodes need the documented ECR pull permissions; Fargate uses its Pod execution role. Cross-account target repositories may still require an explicit Docker config or appropriate workload identity.
- GKE/Artifact Registry: same-project supported clusters can use node identity when its service account and access scopes allow downloads. Cross-project/custom identities need Artifact Registry Reader and appropriate scopes; a Docker config Secret is the portable fallback.
- AKS/ACR: the kubelet managed identity normally needs `AcrPull`; ABAC-enabled registries require `Container Registry Repository Reader` instead. A Docker config Secret remains supported for registries not integrated with AKS.
- Generic Kubernetes, Harbor, GHCR, and Docker Hub: configure a least-privilege read-only Docker config Secret when anonymous pulls are unavailable.

klystr stores each scan status and its normalized report in a project-owned `klystr-scan-<image-id>` ConfigMap. The record lets a reopened browser or restarted server recover queued/running Jobs and display completed findings without launching a duplicate scan. Reports are bounded below the ConfigMap object limit and may be truncated to the first findings when exceptionally large. Archive or delete obsolete scan-record ConfigMaps according to your retention policy.

## Operational notes

- NetworkPolicy must permit scanner Pods to reach the target registry and Trivy vulnerability database endpoints.
- Admission policies must allow the configured pinned scanner image and the non-root security context.
- Job TTL cleanup defaults to 24 hours so klystr can recover a completed report after the browser was closed. Do not reduce it below the longest expected absence before the server can collect completed Pod logs.
- Pin `TRIVY_IMAGE` by digest in production and update it through the normal dependency-review process.
