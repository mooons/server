/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { User } from '@nextcloud/e2e-test-server/cypress'
import { clearState, getNextcloudHeader } from '../../support/commonUtils.ts'

const getAppMenu = () => getNextcloudHeader().find('.app-menu')
// Both triggers share aria-label="Open apps menu", so getByRole can't
// disambiguate them. BEM classes owned by the component under test are
// the next-best stable selectors.
const getWaffleTrigger = () => getAppMenu().find('.app-menu__waffle')
const getCurrentAppTrigger = () => getAppMenu().find('.app-menu__current-app')

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

	describe('Open and close', () => {
		beforeEach(() => {
			cy.createRandomUser().then(($user) => {
				cy.login($user)
				cy.visit('/')
			})
		})

		it('opens the popover when the waffle trigger is clicked', () => {
			getWaffleTrigger().click()
			cy.get('.app-menu__popover').should('be.visible')
			getWaffleTrigger().should('have.attr', 'aria-expanded', 'true')
		})

		it('opens the popover when the current-app trigger is clicked', () => {
			getCurrentAppTrigger().click()
			cy.get('.app-menu__popover').should('be.visible')
			getCurrentAppTrigger().should('have.attr', 'aria-expanded', 'true')
		})

		it('closes the popover when Escape is pressed', () => {
			getWaffleTrigger().click()
			cy.get('.app-menu__popover').should('be.visible')
			// NcPopover activates focus-trap asynchronously after show, so
			// .should('be.visible') can resolve while focus is still on the
			// waffle trigger. Wait for focus to land inside the popover before
			// pressing Esc, otherwise the keyup fires outside the teleported
			// popover subtree and floating-vue's onKeyup listener on the
			// popover root never sees it.
			cy.focused().should('have.attr', 'role', 'menuitem').type('{esc}')
			cy.get('.app-menu__popover').should('not.be.visible')
		})

		it('closes the popover when clicking outside', () => {
			getWaffleTrigger().click()
			cy.get('.app-menu__popover').should('be.visible')
			// Dispatch a click directly on body so the event target is body
			// itself. Coordinate-positioned clicks at the top-left can hit the
			// waffle trigger or logo, which either toggles the popover back
			// open or navigates. Floating-vue's window-level capture listener
			// fires regardless of which element bubbles the event.
			cy.document().then((doc) => {
				doc.body.click()
			})
			cy.get('.app-menu__popover').should('not.be.visible')
		})
	})

	describe('Keyboard navigation', () => {
		beforeEach(() => {
			cy.createRandomUser().then(($user) => {
				cy.login($user)
				cy.visit('/')
			})
		})

		it('opens the popover with Enter on the waffle trigger', () => {
			// Focus the trigger directly: tabbing through the full header is
			// brittle because the number of focusable elements before the
			// waffle can change (skip-links, search, etc.).
			getWaffleTrigger().focus()
			cy.focused().type('{enter}')
			cy.get('.app-menu__popover').should('be.visible')
		})

		it('moves roving focus 3 cells right with ArrowRight and lands on the correct tile', () => {
			getWaffleTrigger().focus()
			cy.focused().type('{enter}')
			cy.get('.app-menu__popover').should('be.visible')

			// Wait for focus-trap to land focus on a tile before driving the
			// keyboard. .should('be.visible') resolves before focus-trap
			// activation, so .focused() can still be the waffle trigger here.
			cy.focused().should('have.attr', 'role', 'menuitem')

			// Reset the roving stop to index 0 so 3 ArrowRights advance deterministically
			// through row 0, regardless of which app is active on login. ArrowRight
			// clamps at column 3, so without this the test could clamp invisibly.
			cy.focused().type('{home}')

			cy.focused().then(($initial) => {
				const initialHref = $initial.attr('href') ?? ''
				cy.focused().type('{rightarrow}{rightarrow}{rightarrow}')

				cy.focused()
					.should('have.attr', 'role', 'menuitem')
					.and('have.attr', 'href')
					.and('not.equal', initialHref)
					.and('include', '/apps/')
			})
		})
	})

	describe('Focus return', () => {
		beforeEach(() => {
			cy.createRandomUser().then(($user) => {
				cy.login($user)
				cy.visit('/')
			})
		})

		it('returns focus to the waffle trigger after closing via Escape', () => {
			getWaffleTrigger().click()
			cy.get('.app-menu__popover').should('be.visible')
			cy.focused().should('have.attr', 'role', 'menuitem').type('{esc}')
			cy.get('.app-menu__popover').should('not.be.visible')
			// NcPopover's setReturnFocus callback targets the waffle when
			// openedFrom is 'waffle' (or null).
			cy.focused().should('have.class', 'app-menu__waffle')
		})

		it('returns focus to the current-app trigger after closing via Escape', () => {
			getCurrentAppTrigger().click()
			cy.get('.app-menu__popover').should('be.visible')
			cy.focused().should('have.attr', 'role', 'menuitem').type('{esc}')
			cy.get('.app-menu__popover').should('not.be.visible')
			// NcPopover's setReturnFocus callback targets the current-app button
			// when openedFrom is 'currentApp'.
			cy.focused().should('have.class', 'app-menu__current-app')
		})
	})

	describe('Admin gating: "More apps" tile', () => {
		const admin = new User('admin', 'admin')

		describe('as admin', () => {
			beforeEach(() => {
				cy.login(admin)
				cy.visit('/')
			})

			it('shows the "More apps" tile', () => {
				getWaffleTrigger().click()
				cy.get('.app-menu__popover').should('be.visible')
				cy.findByRole('menuitem', { name: 'More apps' }).should('be.visible')
			})
		})

		describe('as regular user', () => {
			beforeEach(() => {
				cy.createRandomUser().then(($user) => {
					cy.login($user)
					cy.visit('/')
				})
			})

			it('does not show the "More apps" tile', () => {
				getWaffleTrigger().click()
				cy.get('.app-menu__popover').should('be.visible')
				cy.findByRole('menuitem', { name: 'More apps' }).should('not.exist')
			})
		})
	})
})
