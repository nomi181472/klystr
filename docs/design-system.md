# Klystr design system

Klystr uses Tailwind CSS, semantic CSS variables, shadcn/Base UI primitives, Geist Sans, Geist Mono, and Lucide icons. New screens should compose existing primitives instead of introducing raw replacements.

## Typography

- Page title: `text-lg font-semibold leading-tight`
- Section/card title: `text-sm font-semibold leading-snug`
- Body/control: `text-sm`
- Secondary body: `text-sm text-muted-foreground`
- Label: `text-xs font-medium`
- Caption: `text-xs text-muted-foreground`
- Overline/table header: `text-xs font-medium uppercase tracking-wide text-muted-foreground`
- Kubernetes names, paths, hashes, YAML, and commands: Geist Mono via `font-mono`

Avoid arbitrary font sizes for ordinary copy. Sub-12px text is reserved for dense graph annotations where zoom and spatial constraints require it.

## Color

Use semantic tokens from `app/theme.css`: `background`, `card`, `popover`, `muted`, `border`, `primary`, `success`, `warning`, `destructive`, and `info`. Never introduce literal grays for product surfaces.

## Spacing and layout

- Workspace padding: `p-3 sm:p-4`
- Section gap: `gap-4`
- Compact toolbar gap: `gap-2`
- Default card spacing: 16px; compact card spacing: 12px
- Page content should use the shared `PageHeader` followed by bounded sections.

## Radius and elevation

- Controls: `rounded-lg`
- Cards/panels: `rounded-xl`
- Pills/status: fully rounded
- Use borders for structural separation and shadows only for floating overlays.

## Controls

Use `Button`, `Input`, `Select`, `Checkbox`, `Switch`, and `Textarea` from `components/ui`. Default controls are 32px high. Icon-only actions require an accessible name and normally a tooltip.

## Cards and tables

Use `Card` with `size="sm"` for dense monitoring panels. Tables use a muted semantic header, 12px/16px cell padding, row borders, and a subtle hover surface. Wide tables belong in a labeled horizontal scroll region.

## Loading, empty, and error states

- App boot: branded `LoadingIndicator`.
- Page/section fetch: loader or skeleton inside the final content boundary.
- Button request: small loader without changing button width.
- Empty data: shared `EmptyState` with optional action.
- Errors: semantic destructive surface with a concise recovery action; never render raw exceptions.

## Responsive behavior

Workspace navigation and secondary tabs scroll horizontally below their natural width. Page-header actions wrap below the title. Wide data tables scroll inside their panel without expanding the document.

## Accessibility

Active navigation exposes `aria-current="page"`; icon buttons have accessible names; dialogs support Escape and focus containment; controls have labels; focus-visible rings are never removed without an equivalent; state is never conveyed by color alone.
