---
name: Smart Proxy Route Helper
description: Native, compact controls for explicit domain routing and scoped diagnostics.
colors:
  canvas: "Canvas"
  text: "CanvasText"
  button-surface: "ButtonFace"
  button-text: "ButtonText"
  highlight: "Highlight"
  highlight-text: "HighlightText"
  secondary-text: "color-mix(in srgb, CanvasText 72%, Canvas)"
  control-border: "color-mix(in srgb, CanvasText 28%, Canvas)"
  divider: "color-mix(in srgb, CanvasText 18%, Canvas)"
  proxy: "#16803d"
  direct: "#2563b8"
  warning: "#b54708"
typography:
  options-heading:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "26px"
    lineHeight: 1.25
  options-body:
    fontSize: "15px"
    lineHeight: 1.55
  popup-heading:
    fontSize: "18px"
    lineHeight: 1.25
  popup-body:
    fontSize: "13px"
    lineHeight: 1.5
  label:
    fontSize: "14px"
    fontWeight: 600
rounded:
  control: "6px"
  editor: "8px"
spacing:
  small: "8px"
  group: "12px"
  form: "16px"
  section: "24px"
components:
  options-button:
    backgroundColor: "{colors.button-surface}"
    textColor: "{colors.button-text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  options-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
---

# Design System: Smart Proxy Route Helper

## Overview

The incumbent system uses browser-native surfaces, system typography and compact, labeled controls.
Color explains routing state; text carries the decision. The extension is an operational tool with
English and Russian interfaces, rather than a promotional surface.

The current implementation is evidenced by `src/popup/popup.html`, `src/options/options.html`,
`src/popup/popup.ts` and `src/proxy/routeHealth.ts`. Parent-reported visual inspection covered the
English Popup and Options in isolated Chrome. This record does not establish dark-mode contrast
compliance, Russian layout verification or screen-reader verification.

## Colors

Canvas, text and button colors follow Chrome's light/dark system palette. Secondary text and
borders use mixes against the current canvas. Routing indicators use green for a proxy connection,
blue for DIRECT and amber for a warning or blocked state; text and accessible names also state
the meaning. The browser-control warning has separate light/dark foreground values in the source.

**The Evidence Rule.** A configured route, the actual Chrome Proxy/PAC state and a user-invoked
availability result are separate facts. A route color must not imply successful network/TLS testing.

## Typography

Both surfaces inherit one system sans family. Options uses a restrained hierarchy: page heading,
section heading, subsection heading, body and labels. Its section headings are (20px); subsection
headings are (16px). Popup uses a smaller hierarchy with section labels (13px), a prominent route
label (15px) and helper copy (12px). Hostnames and JSON use monospace because they are data.

## Layout

Options is a centered column capped at (920px), with generous page padding and ruled section
boundaries. Scheme, host and port use three columns; at (720px) and below those fields and rule
rows collapse to one column. The route name/create row wraps naturally.

Popup is a fixed-width (330px) browser surface with (16px) internal padding and vertical scrolling.
Its first sequence is global pause, current hostname, configured route, chosen list/connection,
Chrome Proxy status and explicit actions. Lower diagnostics remain reachable by scrolling. Avoid
expanding always-visible explanations when a compact summary and detailed result can carry them.

## Elevation & Depth

The core UI is flat. Dividers, control borders, tinted editor backgrounds and text hierarchy provide
separation; the extension does not add decorative shadows to its panels. Chrome supplies the
native popup window elevation. A sticky related-domain batch action uses a canvas fade to separate
its controls from scrolling content.

## Shapes

Fields, buttons, rule rows and status containers share gently rounded control corners. Editors
and conflict panels use the larger editor radius. The device routing switch is a pill with a
circular thumb; it is a state control, not a route selector. Route indicators are small filled circles
paired with text.

## Components

- **Route list selector:** a native labeled select. Popup initially selects the effective site's
  route; choosing another list targets new rules and tests. Existing lists remain active together.
  The current site's route summary can therefore differ from the selected list.
- **Connection form:** labeled native controls for connection type, scheme, host and port. DIRECT
  hides endpoint fields. Local connection settings remain distinct from synced route names/rules.
- **Buttons and fields:** modest borders and explicit action labels. Hover strengthens a border;
  keyboard focus has an offset outline. Disabled controls retain their position and reduced opacity.
  Test-in-progress feedback disables the route selector and test button.
- **Route status:** a bordered summary with indicator, route label and matched-scope explanation.
  Its accessible name includes the route and explanation. Paused, missing connection, conflicts and
  default DIRECT have explicit wording.
- **Browser health:** an independent status explains actual PAC/control state, including a temporary
  diagnostic override. It must not be replaced by a connection's saved configuration.
- **Rule rows/editor:** domain and route/scope metadata precede edit/remove actions. Changes have
  an inline preview; conflicts require an explicit keep choice. No modal is needed for ordinary edits.
- **Diagnostic result:** concise success, uncertainty or error copy with preserved limitations.
  Certificate/TLS warnings cannot declare the whole route healthy. Corporate CA guidance belongs
  in the result and points to the Corporate VPN Router wizard for Work.

## Do's and Don'ts

- **Do** preserve native controls, visible labels, keyboard outlines and text-based state explanations.
- **Do** distinguish the selected editing/testing list from the current site's effective rule.
- **Do** keep all route lists simultaneously active and make global Pause the explicit global control.
- **Do** preserve compact summaries while allowing diagnostics, previews and rule lists to scroll.
- **Don't** use color alone to communicate routing, control loss, certificate errors or test outcomes.
- **Don't** show saved proxy settings or an HTTP-only response as proof that HTTPS is healthy.
- **Don't** introduce remote fonts/assets or executable resources into these extension surfaces.
