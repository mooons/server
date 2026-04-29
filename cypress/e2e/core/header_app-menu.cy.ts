/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { clearState, getNextcloudHeader } from '../../support/commonUtils.ts'

const getAppMenu = () => getNextcloudHeader().find('.app-menu')
const getWaffleTrigger = () => getAppMenu().find('button[aria-haspopup="menu"]').first()

describe('Header: App menu (waffle launcher)', { testIsolation: true }, () => {
	beforeEach(() => {
		clearState()
	})

	describe('RTL', () => {
		// Force the server to render the page in Arabic so the JS bundle loads
		// with `isRTL()` returning true. Setting `dir="rtl"` on the document
		// after load only flips CSS direction; the `isRtl` snapshot inside
		// AppMenu's `popoverSkidding` is read at module init and would stay false.
		// `force_language` is a system-wide override that takes effect on every
		// request (see core/src/cypress/e2e/settings/personal-info.cy.ts for the
		// same pattern).
		before(() => {
			// Clear any stale value left behind by a crashed prior run
			cy.runOccCommand('config:system:delete force_language')
			cy.runOccCommand('config:system:set force_language --value ar')
		})

		after(() => {
			cy.runOccCommand('config:system:delete force_language')
		})

		beforeEach(() => {
			cy.createRandomUser().then(($user) => {
				cy.login($user)
				cy.visit('/')
			})
		})

		it('positions the popover on the start side under RTL', () => {
			// In RTL, "start" is the right edge. With `placement: bottom-start`
			// Floating UI anchors the popover to the trigger's right edge, and
			// the mirrored skidding (+82) tucks it under the logo on that side.
			// We assert the popover's right edge sits near the trigger's right
			// edge (within the |skidding| budget plus a small tolerance for
			// sub-pixel rounding and any container padding the popover applies).
			getWaffleTrigger()
				.should('be.visible')
				.then(($trigger) => {
					const triggerRect = $trigger[0].getBoundingClientRect()
					cy.wrap($trigger).click()

					// The popover content is teleported to <body>, so we look it
					// up by its scoped container class rather than scoping under
					// the header.
					cy.get('.app-menu__popover')
						.should('be.visible')
						.then(($popover) => {
							const popoverRect = $popover[0].getBoundingClientRect()
							// Popover's right edge should be within ~120 px of
							// the trigger's right edge (the skidding magnitude
							// is 82, plus padding/box-shadow slack). Critically,
							// the popover's right edge must NOT be far to the
							// LEFT of the trigger's right edge. That would
							// indicate the popover is anchored to the start
							// (left) edge instead of the RTL-flipped end (right).
							expect(popoverRect.right).to.be.greaterThan(
								triggerRect.right - 4,
								'popover right edge should not sit to the left of the trigger right edge in RTL',
							)
							expect(popoverRect.right).to.be.lessThan(
								triggerRect.right + 120,
								'popover right edge should be near the trigger right edge in RTL (within skidding budget)',
							)
						})
				})
		})
	})

	describe('Responsive', () => {
		beforeEach(() => {
			cy.createRandomUser().then(($user) => {
				cy.login($user)
				cy.visit('/')
			})
		})

		// Regression guard: a popover wider than the viewport would push the
		// page out and force horizontal scrolling on mobile, which is bad UX.
		// 360 px is the smallest supported width per the project guidelines.
		it('does not introduce horizontal scroll at 360 px', () => {
			cy.viewport(360, 640)
			getWaffleTrigger().click()
			cy.get('.app-menu__popover-base').should('be.visible')
			cy.document().its('documentElement.scrollWidth').should('be.lte', 360)
		})
	})
})
