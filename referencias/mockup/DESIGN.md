---
name: "Worklog — provisional preview"
description: "Implemented visual proposal for a local work-history dashboard mockup."
colors:
  bg: "#f8f9fa"
  surface: "#fff"
  sidebar: "#f0f1f3"
  ink: "#252930"
  muted: "#606771"
  line: "#e1e4e8"
  accent: "#303740"
  accent-hover: "#20262e"
  purple: "#8b87a3"
  ochre: "#bc9a61"
  blue: "#728e9b"
  project-slate: "#607b9d"
  focus: "#657994"
  nav-active: "#e0e4ea"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "29px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-.035em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-.015em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.25
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 400
rounded:
  tag: "4px"
  icon: "5px"
  control: "6px"
  monogram: "7px"
  summary: "8px"
  panel: "10px"
spacing:
  compact: "8px"
  control: "12px"
  section: "20px"
  mobile-gutter: "20px"
  desktop-gutter: "38px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-flat:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-icon:
    backgroundColor: "transparent"
    rounded: "{rounded.icon}"
    padding: "7px"
  input-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px 10px 37px"
  nav-active:
    backgroundColor: "{colors.nav-active}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  status-badge:
    backgroundColor: "#edeef0"
    textColor: "#5d5e60"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "3px 7px"
  chart-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "20px 23px 17px"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag}"
    padding: "5px 8px"
---

# Design System: Worklog

## Overview

**Creative North Star: "Planning sheets — proposed direction"**

The user approved the mockup layout and requested replacing pastel green. This palette is the revised graphite proposal; the name remains provisional. It uses a graphite and cool neutral palette, system sans typography, compact tables, and familiar web controls to keep work history easy to inspect.

The proposed character is calm and practical: alignment, readable time figures, restrained borders, and shallow tonal layering carry the interface. Worklog is also a provisional name.

**Key Characteristics:**
- Graphite and cool neutral surfaces
- System sans typography and tabular time figures
- Compact operative layout
- Restrained borders and motion

## Colors

### Primary

Graphite marks primary actions, active tabs, and links. Its darker companion supplies primary-button hover. These names and their character are our proposal.

### Secondary

Muted purple, ochre, blue, and project slate distinguish chart series and project identity. They identify data rather than action priority.

### Neutral

Cool neutral background and sidebar surround white working surfaces. Ink carries primary content, muted carries supporting labels, and line separates rows and regions. Focus and selected-navigation colors are explicit state tokens.

## Typography

One system UI sans stack serves the interface. Headline is the page title; title is the section heading; body defines the base; control and label support the compact operative density. Mobile page titles reduce to (27px). Session drawer titles use (23px). Time figures use tabular numerals.

**The Readable Labels Rule.** Functional text stays at or above 11px at every breakpoint.

## Layout

The desktop shell has a fixed left sidebar (222px), a top bar (75px), and centered content capped at (1510px). Main gutters are (38px). The overview pairs flexible content with recent activity (310px), separated by a border. It expands above (1550px), tightens below (1220px), and stacks the overview and detail regions below (1000px).

Below (760px), the sidebar becomes a toggleable drawer (225px); the top bar becomes (59px), and main gutters become (20px). The summary uses two columns with labels below figures; the session count spans the row. Chart dates split onto two lines. Wide project tables scroll horizontally. Printing exposes the report and hides the application shell.

## Elevation & Depth

Flat regions rely on tone and thin borders. The selected segmented control has a small grounding shadow; toast feedback has a diffuse shadow. The session drawer uses a dimmed, slightly blurred backdrop. There are no card shadows at rest. Exact shadows, motion, and breakpoint values live in the sidecar.

## Shapes

Controls use shallow curved corners; badges are tighter, working panels softer. Small colored project monograms and series markers repeat across navigation, tables, and charts. Most separators are single-pixel rules. Avatar circles are distinct from the rounded rectangular working controls.

## Components

- **Buttons:** white secondary, graphite primary, transparent flat and icon variants. Hover changes the background; keyboard focus uses a visible (3px) outline with (3px) offset. Disabled buttons use reduced opacity (.45) and a blocked cursor. No separate pressed animation is implemented.
- **Fields:** white search, select, and note surfaces with thin stone borders and curved corners. Search has an inset magnifying-glass icon. Focus uses the common outline; placeholders remain muted. No custom error presentation is implemented in this preview.
- **Navigation:** muted labels and line icons become graphite on a neutral selected surface, with a semibold selected label. Hover uses a separate tonal surface. On mobile, the same links appear in the slide-in sidebar.
- **Badges and tool chips:** compact status labels and tool initials identify review state and source. Review badges use warm ochre tones. These are informative, not buttons.
- **Panels and tables:** the chart and report preview use white bordered panels; project and session lists use divider rows. Selection checkboxes use the primary accent.
- **Segmented controls and tabs:** selected segments use a white inset surface; selected project tabs use a graphite underline. State is also exposed through pressed/current accessibility attributes.
- **Chart and session drawer:** chart stacks preserve one scale when grouping changes and reveal totals on hover or keyboard focus. Session details open in a right-hand native dialog (535px maximum width), with independently labeled dedication and AI execution figures.

## Do's and Don'ts

- Do retain the system sans stack and tabular numerals for time.
- Do keep functional text at or above 11px, including mobile labels.
- Do preserve visible keyboard focus and the reduced-motion override.
- Do keep the mockup’s illustrative-data notices visible.
- Don’t treat this proposal as an approved brand identity.
- Don’t introduce ornamental gradients, display typefaces, or additional card shadows into this preview.
- Don’t make dedication and AI execution look like additive measures.
