# VideoFlow design review

## Scope and evidence

Independent Impeccable finish review of the approved specification-led CRM/SaaS direction. Initial visual scope: History and shared shell in `.impeccable/review/dashboard-{light,dark}-{360,768,1440}.png`. All six captures were opened and valid. Other pages were reviewed in source only. No approved generated comp, separate five-block direction/seed, or QUALITY BAR card was supplied; the approved OpenSpec design and `apps/web/PRODUCT.md` governed the review without introducing a new visual concept.

The initial review found the navigation, hierarchy, responsive table, system typography, Lucide icons, and green-neutral surfaces consistent with the approved direction. Mobile reduction of secondary table fields follows the approved design. No material visual defect was identified in the six captures. The parent reported one detector pass with no findings and passing contrast/keyboard checks; the reviewer did not rerun the detector.

Initial disposition: **fix**. One material fix: preserve cached job details with a stale-data/retry message after refresh errors, and show remaining file availability beside absolute expiry with an expired state.

## Verdict

**Resolved:** `.impeccable/review/detail-stale-expired.png` visibly retains the job title, progress and metadata below the stale-data banner and retry action. Absolute expiry remains visible, with an explicit expired message on a separate line. Source inspection confirms the remaining-minutes branch and local timer that transitions to expiration. The parent reports the targeted stale/remaining/expired browser test passed, and 12 browser tests passed including accessibility checks for all five routes and the cancellation dialog in both themes. These test results are parent-reported, not independently rerun by this reviewer.

No regression from this fix was observed in the supplied drawer capture. This follow-up scores the listed fix only; it does not extend screenshot coverage to all other pages.

## Remaining

Clear. Preserve the restrained CRM hierarchy, green-neutral themes, single primary action, compact operational table, and mobile prioritization of title, status and actions.

disposition: ship

Ship covers the scored fix.
