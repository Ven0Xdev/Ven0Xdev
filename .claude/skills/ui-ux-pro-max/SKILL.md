---
name: ui-ux-pro-max
description: "UI/UX design intelligence. 67 styles, 161 palettes, 57 font pairings, 25 charts, 15 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient. Integrations: shadcn/ui MCP for component search and examples."
---

# UI/UX Pro Max - Design Intelligence

Comprehensive design guide for web and mobile applications. Contains 67 styles, 161 color palettes, 57 font pairings, 99 UX guidelines, and 25 chart types across 15 technology stacks. Searchable database with priority-based recommendations.

## When to Apply

This Skill should be used when the task involves **UI structure, visual design decisions, interaction patterns, or user experience quality control**.

### Must Use

This Skill must be invoked in the following situations:

- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts, etc.)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for user experience, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)
- Improving perceived quality, clarity, or usability of interfaces

### Recommended

This Skill is recommended in the following situations:

- UI looks "not professional enough" but the reason is unclear
- Receiving feedback on usability or experience
- Pre-launch UI quality optimization
- Aligning cross-platform design (Web / iOS / Android)
- Building design systems or reusable component libraries

### Skip

This Skill is not needed in the following situations:

- Pure backend logic development
- Only involving API or database design
- Performance optimization unrelated to the interface
- Infrastructure or DevOps work
- Non-visual scripts or automation tasks

**Decision criteria**: If the task will change how a feature **looks, feels, moves, or is interacted with**, this Skill should be used.

## Rule Categories by Priority

| Priority | Category | Impact | Domain | Key Checks (Must Have) | Anti-Patterns (Avoid) |
|----------|----------|--------|--------|------------------------|------------------------|
| 1 | Accessibility | CRITICAL | `ux` | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Removing focus rings, Icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | `ux` | Min size 44×44px, 8px+ spacing, Loading feedback | Reliance on hover only, Instant state changes (0ms) |
| 3 | Performance | HIGH | `ux` | WebP/AVIF, Lazy loading, Reserve space (CLS < 0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | Style Selection | HIGH | `style`, `product` | Match product type, Consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic randomly, Emoji as icons |
| 5 | Layout & Responsive | HIGH | `ux` | Mobile-first breakpoints, Viewport meta, No horizontal scroll | Horizontal scroll, Fixed px container widths, Disable zoom |
| 6 | Typography & Color | MEDIUM | `typography`, `color` | Base 16px, Line-height 1.5, Semantic color tokens | Text < 12px body, Gray-on-gray, Raw hex in components |
| 7 | Animation | MEDIUM | `ux` | Duration 150–300ms, Motion conveys meaning, Spatial continuity | Decorative-only animation, Animating width/height, No reduced-motion |
| 8 | Forms & Feedback | MEDIUM | `ux` | Visible labels, Error near field, Helper text, Progressive disclosure | Placeholder-only label, Errors only at top, Overwhelm upfront |
| 9 | Navigation Patterns | HIGH | `ux` | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back behavior, No deep links |
| 10 | Charts & Data | LOW | `chart` | Legends, Tooltips, Accessible colors | Relying on color alone to convey meaning |

## Quick Reference

### 1. Accessibility (CRITICAL)

- `color-contrast` - Minimum 4.5:1 ratio for normal text (large text 3:1)
- `focus-states` - Visible focus rings on interactive elements (2–4px)
- `alt-text` - Descriptive alt text for meaningful images
- `aria-labels` - aria-label for icon-only buttons; accessibilityLabel in native
- `keyboard-nav` - Tab order matches visual order; full keyboard support
- `form-labels` - Use label with for attribute
- `skip-links` - Skip to main content for keyboard users
- `heading-hierarchy` - Sequential h1→h6, no level skip
- `color-not-only` - Don't convey info by color alone (add icon/text)
- `dynamic-type` - Support system text scaling; avoid truncation as text grows
- `reduced-motion` - Respect prefers-reduced-motion
- `voiceover-sr` - Meaningful accessibilityLabel/accessibilityHint; logical reading order
- `escape-routes` - Provide cancel/back in modals and multi-step flows
- `keyboard-shortcuts` - Preserve system and a11y shortcuts

### 2. Touch & Interaction (CRITICAL)

- `touch-target-size` - Min 44×44pt (Apple) / 48×48dp (Material)
- `touch-spacing` - Minimum 8px/8dp gap between touch targets
- `hover-vs-tap` - Use click/tap for primary interactions; don't rely on hover alone
- `loading-buttons` - Disable button during async operations; show spinner or progress
- `error-feedback` - Clear error messages near problem
- `cursor-pointer` - Add cursor-pointer to clickable elements (Web)
- `gesture-conflicts` - Avoid horizontal swipe on main content
- `tap-delay` - Use touch-action: manipulation to reduce 300ms delay (Web)
- `standard-gestures` - Use platform standard gestures consistently
- `press-feedback` - Visual feedback on press (ripple/highlight)
- `haptic-feedback` - Use haptic for confirmations; avoid overuse
- `safe-area-awareness` - Keep primary touch targets away from notch and screen edges

### 3. Performance (HIGH)

- `image-optimization` - Use WebP/AVIF, responsive images (srcset/sizes), lazy load
- `image-dimension` - Declare width/height or use aspect-ratio to prevent layout shift
- `font-loading` - Use font-display: swap/optional to avoid invisible text
- `critical-css` - Prioritize above-the-fold CSS
- `lazy-loading` - Lazy load non-hero components
- `bundle-splitting` - Split code by route/feature
- `virtualize-lists` - Virtualize lists with 50+ items
- `progressive-loading` - Use skeleton screens / shimmer for >1s operations

### 4. Style Selection (HIGH)

- `style-match` - Match style to product type (use `--design-system` for recommendations)
- `consistency` - Use same style across all pages
- `no-emoji-icons` - Use SVG icons (Heroicons, Lucide), not emojis
- `color-palette-from-product` - Choose palette from product/industry
- `platform-adaptive` - Respect platform idioms (iOS HIG vs Material)
- `dark-mode-pairing` - Design light/dark variants together

### 5. Layout & Responsive (HIGH)

- `viewport-meta` - width=device-width initial-scale=1 (never disable zoom)
- `mobile-first` - Design mobile-first, then scale up
- `breakpoint-consistency` - Use systematic breakpoints (375 / 768 / 1024 / 1440)
- `readable-font-size` - Minimum 16px body text on mobile
- `horizontal-scroll` - No horizontal scroll on mobile
- `spacing-scale` - Use 4pt/8dp incremental spacing system
- `container-width` - Consistent max-width on desktop (max-w-6xl / 7xl)

### 6. Typography & Color (MEDIUM)

- `line-height` - Use 1.5-1.75 for body text
- `line-length` - Limit to 65-75 characters per line
- `font-pairing` - Match heading/body font personalities
- `font-scale` - Consistent type scale (e.g. 12 14 16 18 24 32)
- `color-semantic` - Define semantic color tokens; not raw hex in components
- `color-dark-mode` - Dark mode uses desaturated/lighter tonal variants

### 7. Animation (MEDIUM)

- `duration-timing` - Use 150–300ms for micro-interactions
- `transform-performance` - Use transform/opacity only; avoid animating width/height
- `loading-states` - Show skeleton or progress indicator when loading exceeds 300ms
- `easing` - Use ease-out for entering, ease-in for exiting
- `motion-meaning` - Every animation must express cause-effect, not just decoration
- `spring-physics` - Prefer spring/physics-based curves for natural feel

### 8. Forms & Feedback (MEDIUM)

- `input-labels` - Visible label per input (not placeholder-only)
- `error-placement` - Show error below the related field
- `submit-feedback` - Loading then success/error state on submit
- `required-indicators` - Mark required fields (e.g. asterisk)
- `empty-states` - Helpful message and action when no content
- `toast-dismiss` - Auto-dismiss toasts in 3-5s
- `inline-validation` - Validate on blur; show error only after user finishes input

### 9. Navigation Patterns (HIGH)

- `bottom-nav-limit` - Bottom navigation max 5 items; use labels with icons
- `drawer-usage` - Use drawer/sidebar for secondary navigation
- `back-behavior` - Back navigation must be predictable and consistent
- `deep-linking` - All key screens must be reachable via deep link / URL
- `modal-escape` - Modals must offer a clear close/dismiss affordance
- `state-preservation` - Navigating back must restore previous scroll position and filter state

### 10. Charts & Data (LOW)

- `chart-type` - Match chart type to data type (trend → line, comparison → bar)
- `color-guidance` - Use accessible color palettes; avoid red/green only pairs
- `legend-visible` - Always show legend
- `tooltip-on-interact` - Provide tooltips on hover/tap showing exact values
- `responsive-chart` - Charts must reflow on small screens
- `empty-data-state` - Show meaningful empty state when no data exists

## How to Use

Search specific domains using the CLI tool below.

---

## Prerequisites

Check if Python is installed:

```bash
python3 --version || python --version
```

---

## How to Use This Skill

| Scenario | Trigger Examples | Start From |
|----------|-----------------|------------|
| **New project / page** | "Build a landing page", "Build a dashboard" | Step 1 → Step 2 (design system) |
| **New component** | "Create a pricing card", "Add a modal" | Step 3 (domain search: style, ux) |
| **Choose style / color / font** | "What style fits a fintech app?" | Step 2 (design system) |
| **Review existing UI** | "Review this page for UX issues" | Quick Reference checklist above |
| **Fix a UI bug** | "Button hover is broken" | Quick Reference → relevant section |
| **Improve / optimize** | "Make this faster", "Improve mobile experience" | Step 3 (domain search: ux) |

Follow this workflow:

### Step 1: Analyze User Requirements

Extract key information from user request:
- **Product type**: Entertainment, Tool, Productivity, or hybrid
- **Target audience**: age group, usage context
- **Style keywords**: playful, vibrant, minimal, dark mode, content-first, etc.
- **Stack**: React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, etc.

### Step 2: Generate Design System (REQUIRED)

**Always start with `--design-system`** to get comprehensive recommendations:

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

**Example:**
```bash
python3 skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service" --design-system -p "Serenity Spa"
```

### Step 2b: Persist Design System (Master + Overrides Pattern)

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
```

This creates:
- `design-system/MASTER.md` — Global Source of Truth
- `design-system/pages/` — Folder for page-specific overrides

### Step 3: Supplement with Detailed Searches

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

**When to use detailed searches:**

| Need | Domain | Example |
|------|--------|---------|
| Product type patterns | `product` | `--domain product "entertainment social"` |
| More style options | `style` | `--domain style "glassmorphism dark"` |
| Color palettes | `color` | `--domain color "entertainment vibrant"` |
| Font pairings | `typography` | `--domain typography "playful modern"` |
| Chart recommendations | `chart` | `--domain chart "real-time dashboard"` |
| UX best practices | `ux` | `--domain ux "animation accessibility"` |
| Individual Google Fonts | `google-fonts` | `--domain google-fonts "sans serif popular"` |
| Landing structure | `landing` | `--domain landing "hero social-proof"` |
| React performance | `react` | `--domain react "rerender memo list"` |
| App interface a11y | `web` | `--domain web "accessibilityLabel touch"` |

### Step 4: Stack Guidelines

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack <stack>
```

Available stacks: `react`, `nextjs`, `vue`, `svelte`, `astro`, `swiftui`, `react-native`, `flutter`, `nuxtjs`, `nuxt-ui`, `html-tailwind`, `shadcn`, `jetpack-compose`, `threejs`

---

## Search Reference

### Available Domains

| Domain | Use For | Example Keywords |
|--------|---------|------------------|
| `product` | Product type recommendations | SaaS, e-commerce, portfolio, healthcare |
| `style` | UI styles, colors, effects | glassmorphism, minimalism, dark mode |
| `typography` | Font pairings, Google Fonts | elegant, playful, professional, modern |
| `color` | Color palettes by product type | saas, ecommerce, healthcare, beauty |
| `landing` | Page structure, CTA strategies | hero, testimonial, pricing, social-proof |
| `chart` | Chart types, library recommendations | trend, comparison, timeline, funnel |
| `ux` | Best practices, anti-patterns | animation, accessibility, loading |
| `google-fonts` | Individual Google Fonts lookup | sans serif, monospace, variable font |
| `react` | React/Next.js performance | waterfall, bundle, suspense, memo |
| `web` | App interface guidelines | accessibilityLabel, touch targets, safe areas |

---

## Output Formats

```bash
# ASCII box (default)
python3 skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system

# Markdown
python3 skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system -f markdown
```

---

## Pre-Delivery Checklist

Before delivering UI code, verify these items:

### Visual Quality
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons come from a consistent icon family and style
- [ ] Semantic theme tokens are used consistently

### Interaction
- [ ] All tappable elements provide clear pressed feedback
- [ ] Touch targets meet minimum size (>=44x44pt iOS, >=48x48dp Android)
- [ ] Micro-interaction timing stays in the 150-300ms range
- [ ] Disabled states are visually clear and non-interactive

### Light/Dark Mode
- [ ] Primary text contrast >=4.5:1 in both light and dark mode
- [ ] Secondary text contrast >=3:1 in both modes
- [ ] Both themes are tested before delivery

### Layout
- [ ] Safe areas are respected for headers, tab bars, and bottom CTA bars
- [ ] Scroll content is not hidden behind fixed/sticky bars
- [ ] Verified on small phone, large phone, and tablet
- [ ] 4/8dp spacing rhythm is maintained

### Accessibility
- [ ] All meaningful images/icons have accessibility labels
- [ ] Form fields have labels, hints, and clear error messages
- [ ] Color is not the only indicator
- [ ] Reduced motion and dynamic text size are supported
