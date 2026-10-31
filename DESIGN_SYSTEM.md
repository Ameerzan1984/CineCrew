# Design system

CineMesh uses a cinema-inspired dark palette: background `#08080C`, surface `#13131C`, elevated `#20202C`, primary `#8357FF`, primary light `#AE93FF`, text `#F7F7FA`, secondary `#9898A9`, success `#22C55E`, warning `#F59E0B`, error `#EF4444`. Type, spacing, surfaces and interactive states should be consistent and responsive; controls need semantic labels, focus indicators and keyboard access. Respect reduced-motion preferences. Arabic RTL and a light theme remain requirements to complete and validate across every view.

Film review controls use five keyboard-operable star buttons with explicit rating labels and pressed state, a constrained review form, and inline average/review-count summary. Keep these controls readable and usable in RTL on narrow screens.

Film lists use the same dark settings-card surfaces and purple focus/accent treatment. Public/private state and item counts must be visible in the list card; create/edit controls remain labeled, and film titles stay actionable without turning owner-only delete/remove controls into public actions. Keep the two-column layout stacked on narrow screens and preserve logical reading order in RTL.

The generated Film Bible review uses compact character cards with stable asset IDs, readable metadata labels and collapsible long-form details. Avoid rendering machine-local image/audio paths; future visual references should be served through authorized media URLs or asset IDs.

The first Timeline control uses an ordered list of scene cards with a stable sequence number, title, duration when available, and owner-only move buttons. Keep move controls keyboard-operable, provide an accessible scene-specific label, visibly disable boundary moves, and stack the card layout on narrow screens without changing the scene order.
