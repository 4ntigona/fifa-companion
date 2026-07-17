# PEDRO \ RIVERA

## Mission
Create implementation-ready, token-driven UI guidance for PEDRO \ RIVERA that is optimized for consistency, accessibility, and fast delivery across content site.

## Brand
- Product/brand: PEDRO \ RIVERA
- URL: https://pedrorivera.me/
- Audience: readers and knowledge seekers
- Product surface: content site

## Style Foundations
- Visual style: clean, functional, implementation-oriented
- Main font style: `font.family.primary=IBM Plex Mono`, `font.family.stack=IBM Plex Mono, monospace`, `font.size.base=16.8568px`, `font.weight.base=400`, `font.lineHeight.base=25.2851px`
- Typography scale: `font.size.xs=10.06px`, `font.size.sm=12.57px`, `font.size.md=13.33px`, `font.size.lg=14.6px`, `font.size.xl=16.86px`, `font.size.2xl=23.2px`, `font.size.3xl=26.07px`, `font.size.4xl=32.85px`
- Color palette: `color.text.primary=#fcfcfc`, `color.text.secondary=#666666`, `color.surface.muted=#030303`, `color.surface.base=#000000`, `color.surface.raised=color(srgb 0.01 0.01 0.01 / 0.99)`, `color.surface.strong=#ff0033`, `color.border.muted=rgb(252, 252, 252) rgb(252, 252, 252) rgb(13, 13, 13)`
- Spacing scale: `space.1=4.52px`, `space.2=4.93px`, `space.3=15.09px`, `space.4=18.23px`, `space.5=21.89px`, `space.6=36.67px`
- Radius/shadow/motion tokens: `motion.duration.instant=200ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
Concise, confident, implementation-focused.

## Rules: Do
- Use semantic tokens, not raw hex values, in component guidance.
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error.
- Component behavior should specify responsive and edge-case handling.
- Interactive components must document keyboard, pointer, and touch behavior.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not ship component guidance without explicit state rules.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria with pass/fail checks.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with a QA checklist.

## Required Output Structure
- Context and goals.
- Design tokens and foundations.
- Component-level rules (anatomy, variants, states, responsive behavior).
- Accessibility requirements and testable acceptance criteria.
- Content and tone standards with examples.
- Anti-patterns and prohibited implementations.
- QA checklist.

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.

- Extraction diagnostics: Audience and product surface inference confidence is low; verify generated brand context.

## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Teams should prefer system consistency over local visual exceptions.
