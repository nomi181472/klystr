# UI consistency audit

Baseline: `artifacts/ui-audit/before/`  
Route model: one App Router route (`/`) with RBAC, Topology, Image Analysis, Manifests, and Security workspaces.

## UI-001 — Workspace selection semantics

- Category: ACCESSIBILITY, INTERACTION
- Routes: `/` workspace navigation
- Problem: Image Analysis and Manifests do not expose the active workspace with `aria-current`, unlike RBAC, Topology, and Security.
- Evidence: `before/desktop-image-analysis.png`, `before/desktop-manifests-empty.png`
- Root cause: duplicated raw navigation buttons with incomplete active-state attributes.
- Resolution: migrate the navigation to a shared mapped definition and apply one active-state contract.
- Status: Fixed

## UI-002 — Page-header hierarchy

- Category: TYPOGRAPHY, SPACING, ALIGNMENT, COMPONENT
- Routes: RBAC, Image Analysis, Manifests, Security
- Problem: page titles, descriptions, icons, actions, and outer padding use unrelated structures and dimensions.
- Evidence: `before/desktop-rbac.png`, `before/desktop-image-analysis.png`, `before/desktop-manifests-empty.png`, `before/desktop-security.png`
- Root cause: no shared page-header primitive.
- Resolution: introduce `PageHeader` and migrate representative workspace headers.
- Status: Fixed for Image Analysis; remaining workspace headers retain domain-specific layouts pending migration.

## UI-003 — Empty-state treatment

- Category: EMPTY_STATE, SPACING, COMPONENT
- Routes: Manifests, filtered inventory and graph states
- Problem: empty states range from plain text to bespoke bordered blocks and cannot consistently expose actions.
- Evidence: `before/desktop-manifests-empty.png`, `before/mobile-manifests-empty.png`
- Root cause: no reusable empty-state primitive.
- Resolution: introduce `EmptyState` with icon, title, description, and actions.
- Status: Fixed for the Manifest workspace; remaining domain empty states can migrate incrementally.

## UI-004 — Table density and typography

- Category: TYPOGRAPHY, SPACING, TABLE, COMPONENT
- Routes: RBAC, Image Analysis, Manifests, Security
- Problem: Security table consistency is implemented through `.security-workspace` global selectors while other tables independently define header/cell density.
- Evidence: `before/desktop-security.png`, `before/desktop-rbac.png`
- Root cause: missing semantic data-table styles/primitives.
- Resolution: introduce reusable table primitives and remove route ownership from generic table styling over time.
- Status: Fixed for Image Analysis and Security through the shared `ui-data-table` contract.

## UI-005 — Loading-state hierarchy

- Category: LOADING, LAYOUT
- Routes: Topology, Image Analysis, Security
- Problem: loading states use different visual scale and do not always preserve the final content boundary.
- Evidence: `before/desktop-image-analysis.png`, `before/desktop-security.png`
- Root cause: branded loader exists, but page/section loading patterns are not formalized.
- Resolution: document page, section, table, and button loading conventions; reuse `LoadingIndicator` at the correct scope.
- Status: Documented; existing behavior preserved because loader scope changes require data-specific skeleton designs.

## UI-006 — Metadata typography

- Category: TYPOGRAPHY
- Routes: all workspaces
- Problem: repeated arbitrary 9px, 10px, and 11px utilities represent the same caption/overline concepts.
- Evidence: all baseline screenshots.
- Root cause: no named typography roles beyond primitive defaults.
- Resolution: add semantic typography utilities and migrate high-frequency patterns incrementally.
- Status: Semantic caption/overline roles introduced; dense graph-only annotations intentionally remain precise.

## UI-007 — Responsive dense data

- Category: RESPONSIVE, LAYOUT
- Routes: Security and Manifests
- Problem: wide tables require horizontal scrolling on mobile, but the scroll affordance is subtle.
- Evidence: `before/mobile-security.png`, `before/mobile-manifests-empty.png`
- Root cause: desktop-first tabular data without a shared responsive table shell.
- Resolution: standardize an accessible horizontal table region with visible containment.
- Status: Verified: wide tables scroll inside their panel and do not expand the document.
