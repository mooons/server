/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { INavigationEntry } from '../../types/navigation.d.ts'

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted so mocks exist before the SFC's imports run.
const initialState = vi.hoisted(() => ({
	loadState: vi.fn(),
}))
vi.mock('@nextcloud/initial-state', () => initialState)

const auth = vi.hoisted(() => ({
	getCurrentUser: vi.fn(() => ({ isAdmin: false })),
}))
vi.mock('@nextcloud/auth', () => auth)

const eventBus = vi.hoisted(() => {
	const handlers: Record<string, Array<(payload: unknown) => void>> = {}
	return {
		subscribe: vi.fn((name: string, fn: (payload: unknown) => void) => {
			(handlers[name] ||= []).push(fn)
		}),
		unsubscribe: vi.fn((name: string, fn: (payload: unknown) => void) => {
			handlers[name] = (handlers[name] ?? []).filter((h) => h !== fn)
		}),
		emit: vi.fn((name: string, payload: unknown) => {
			(handlers[name] ?? []).forEach((h) => h(payload))
		}),
		__handlers: handlers,
	}
})
vi.mock('@nextcloud/event-bus', () => eventBus)

// Stub @nextcloud/router so we don't need a webroot for the moreApps URL.
vi.mock('@nextcloud/router', () => ({
	generateUrl: (path: string) => path,
	generateFilePath: (app: string, type: string, file: string) => `/apps/${app}/${type}/${file}`,
}))

// Build a minimal nav entry that satisfies INavigationEntry.
function makeApp(overrides: Partial<INavigationEntry> = {}): INavigationEntry {
	return {
		id: 'files',
		active: false,
		order: 0,
		href: '/apps/files',
		icon: '/apps/files/img/app.svg',
		type: 'link',
		name: 'Files',
		unread: 0,
		...overrides,
	}
}

function fakeApps(): INavigationEntry[] {
	return [
		makeApp({ id: 'files', name: 'Files', href: '/apps/files', active: true }),
		makeApp({ id: 'mail', name: 'Mail', href: '/apps/mail' }),
		makeApp({ id: 'calendar', name: 'Calendar', href: '/apps/calendar' }),
	]
}

function eightApps(activeIndex: number = -1): INavigationEntry[] {
	const ids = ['files', 'mail', 'calendar', 'contacts', 'notes', 'photos', 'talk', 'deck']
	return ids.map((id, i) => makeApp({
		id,
		name: id.charAt(0).toUpperCase() + id.slice(1),
		href: `/apps/${id}`,
		active: i === activeIndex,
	}))
}

// Import AFTER mocks are registered. Static `import` would hoist above
// vi.mock() and break the wiring; dynamic import in beforeAll/await is the
// idiomatic Vitest workaround when you need to control mock state per test.
import type AppMenuModule from '../../components/AppMenu.vue'
let AppMenu: typeof AppMenuModule

beforeEach(async () => {
	vi.clearAllMocks()
	for (const k of Object.keys(eventBus.__handlers)) {
		delete eventBus.__handlers[k]
	}
	initialState.loadState.mockImplementation((_app: string, key: string, fallback: unknown) => key === 'apps' ? fakeApps() : fallback)
	auth.getCurrentUser.mockReturnValue({ isAdmin: false })
	AppMenu = (await import('../../components/AppMenu.vue')).default
})

afterEach(() => {
	// NcPopover teleports to <body>; clear teleported nodes between tests.
	while (document.body.firstChild) {
		document.body.removeChild(document.body.firstChild)
	}
})

// Click the waffle trigger and poll until the teleported menuitems are in the
// DOM. NcPopover teleports to <body> so wrapper.find() can't see them; vi.waitFor
// retries the DOM query rather than relying on flaky nextTick/setTimeout flushes.
async function openPopover(wrapper: ReturnType<typeof mount>) {
	await wrapper.get('.app-menu__waffle').trigger('click')
	await vi.waitFor(() => {
		expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0)
	})
}

describe('core: AppMenu', () => {
	it('renders one AppItem per app in the list', async () => {
		const wrapper = mount(AppMenu, { attachTo: document.body })
		await openPopover(wrapper)

		const items = document.querySelectorAll('[role="menuitem"]')
		expect(items).toHaveLength(3)
		const labels = Array.from(items).map((el) => el.querySelector('.app-item__label')?.textContent?.trim() ?? '')
		expect(labels).toEqual(['Files', 'Mail', 'Calendar'])
	})

	it('renders the "More apps" tile when the current user is an admin', async () => {
		auth.getCurrentUser.mockReturnValue({ isAdmin: true })
		const wrapper = mount(AppMenu, { attachTo: document.body })
		await openPopover(wrapper)

		const items = document.querySelectorAll('[role="menuitem"]')
		expect(items).toHaveLength(4)
		const moreApps = Array.from(items).find((el) => el.textContent?.includes('More apps'))
		expect(moreApps).toBeTruthy()
	})

	it('does NOT render "More apps" when the current user is not an admin', async () => {
		auth.getCurrentUser.mockReturnValue({ isAdmin: false })
		const wrapper = mount(AppMenu, { attachTo: document.body })
		await openPopover(wrapper)

		const items = document.querySelectorAll('[role="menuitem"]')
		expect(items).toHaveLength(3)
		const moreApps = Array.from(items).find((el) => el.textContent?.includes('More apps'))
		expect(moreApps).toBeFalsy()
	})

	it('currentApp.id === "dashboard" makes openInNewTab false', async () => {
		initialState.loadState.mockImplementation((_a: string, key: string, fallback: unknown) => key === 'apps'
			? [
					makeApp({
						id: 'dashboard',
						name: 'Dashboard',
						href: '/apps/dashboard',
						active: true,
					}),
					makeApp({ id: 'mail', name: 'Mail', href: '/apps/mail' }),
				]
			: fallback)
		const wrapper = mount(AppMenu, { attachTo: document.body })
		await openPopover(wrapper)

		// AppItem only sets target/rel when `newTab` is true; with dashboard
		// active, AppMenu passes newTab=false, so neither attribute should
		// appear on any tile.
		const items = document.querySelectorAll('[role="menuitem"]')
		for (const a of items) {
			expect(a.getAttribute('target')).toBeNull()
			expect(a.getAttribute('rel')).toBeNull()
		}
	})

	it('nextcloud:app-menu.refresh updates the rendered list', async () => {
		const wrapper = mount(AppMenu, { attachTo: document.body })
		await openPopover(wrapper)
		expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3)

		// AppMenu subscribes to this event in mounted(); fire it via our mock.
		eventBus.emit('nextcloud:app-menu.refresh', {
			apps: [
				makeApp({ id: 'notes', name: 'Notes', href: '/apps/notes', active: true }),
			],
		})
		await wrapper.vm.$nextTick()

		const items = document.querySelectorAll('[role="menuitem"]')
		expect(items).toHaveLength(1)
		expect(items[0].getAttribute('title')).toBe('Notes')
	})

	describe('keyboard navigation (roving tabindex)', () => {
		// Helpers scoped to this block. Each test mounts AppMenu with an
		// 8-app fixture (two full rows of four columns) so we can exercise
		// arrow-key edges without partial-row complications.
		const COLS = 4

		function tabindices(): Array<string | null> {
			return Array.from(document.querySelectorAll('[role="menuitem"]'))
				.map((el) => el.getAttribute('tabindex'))
		}

		function dispatchGridKey(key: string) {
			// The grid container hosts the keydown handler. Targeting it
			// directly mirrors what happens when focus is on a child <a> --
			// keydown bubbles up to the grid.
			const grid = document.querySelector('.app-menu__grid') as HTMLElement | null
			if (!grid) {
				throw new Error('app-menu__grid not in document')
			}
			grid.dispatchEvent(new KeyboardEvent('keydown', {
				key,
				bubbles: true,
				cancelable: true,
			}))
		}

		beforeEach(() => {
			initialState.loadState.mockImplementation((_a: string, key: string, fallback: unknown) => key === 'apps' ? eightApps() : fallback)
		})

		it('on mount, only the first item has tabindex=0; rest are -1', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			const tabs = tabindices()
			expect(tabs).toHaveLength(8)
			expect(tabs[0]).toBe('0')
			for (let i = 1; i < tabs.length; i++) {
				expect(tabs[i]).toBe('-1')
			}
		})

		it('active app gets tabindex=0 instead of the first item', async () => {
			// Mark index 3 as active; index 0 should NOT be the roving stop.
			initialState.loadState.mockImplementation((_a: string, key: string, fallback: unknown) => key === 'apps' ? eightApps(3) : fallback)
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			const tabs = tabindices()
			expect(tabs[3]).toBe('0')
			expect(tabs[0]).toBe('-1')
		})

		it('ArrowRight moves the roving stop from index 0 to index 1 and focuses it', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			dispatchGridKey('ArrowRight')
			await wrapper.vm.$nextTick()
			// One extra tick: the handler awaits $nextTick before calling
			// .focus(), so we need a second flush before activeElement settles.
			await wrapper.vm.$nextTick()

			const items = document.querySelectorAll('[role="menuitem"]')
			expect(items[1].getAttribute('tabindex')).toBe('0')
			expect(items[0].getAttribute('tabindex')).toBe('-1')
			expect(document.activeElement).toBe(items[1])
		})

		it('ArrowLeft from index 0 stays put (no wrap)', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			dispatchGridKey('ArrowLeft')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()

			const items = document.querySelectorAll('[role="menuitem"]')
			expect(items[0].getAttribute('tabindex')).toBe('0')
		})

		it('ArrowDown from index 1 moves to index 1 + col count (=5)', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			// Step right once to land on index 1 first.
			dispatchGridKey('ArrowRight')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()

			dispatchGridKey('ArrowDown')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()

			const items = document.querySelectorAll('[role="menuitem"]')
			expect(items[1 + COLS].getAttribute('tabindex')).toBe('0')
		})

		it('ArrowDown from a bottom-row item stays put', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			// Walk to index 5 (second row, second column).
			dispatchGridKey('ArrowRight') // -> 1
			await wrapper.vm.$nextTick()
			dispatchGridKey('ArrowDown') // -> 5
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()

			let items = document.querySelectorAll('[role="menuitem"]')
			expect(items[5].getAttribute('tabindex')).toBe('0')

			// Down again would target index 9, out of bounds for 8 items.
			dispatchGridKey('ArrowDown')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()
			items = document.querySelectorAll('[role="menuitem"]')
			expect(items[5].getAttribute('tabindex')).toBe('0')
		})

		it('ArrowUp from index 0 stays put', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			dispatchGridKey('ArrowUp')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()

			const items = document.querySelectorAll('[role="menuitem"]')
			expect(items[0].getAttribute('tabindex')).toBe('0')
		})

		it('ArrowRight from rightmost item in a row stays put (no wrap to next row)', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			// Walk to index 3 (rightmost in top row).
			for (let i = 0; i < 3; i++) {
				dispatchGridKey('ArrowRight')
				await wrapper.vm.$nextTick()
			}
			await wrapper.vm.$nextTick()

			let items = document.querySelectorAll('[role="menuitem"]')
			expect(items[3].getAttribute('tabindex')).toBe('0')

			// Press Right again -- should NOT wrap to index 4.
			dispatchGridKey('ArrowRight')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()
			items = document.querySelectorAll('[role="menuitem"]')
			expect(items[3].getAttribute('tabindex')).toBe('0')
			expect(items[4].getAttribute('tabindex')).toBe('-1')
		})

		it('Home jumps to index 0; End jumps to last item', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			dispatchGridKey('End')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()

			let items = document.querySelectorAll('[role="menuitem"]')
			expect(items[items.length - 1].getAttribute('tabindex')).toBe('0')

			dispatchGridKey('Home')
			await wrapper.vm.$nextTick()
			await wrapper.vm.$nextTick()

			items = document.querySelectorAll('[role="menuitem"]')
			expect(items[0].getAttribute('tabindex')).toBe('0')
		})

		it('Tab is not intercepted (browser handles default focus order)', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await openPopover(wrapper)

			const grid = document.querySelector('.app-menu__grid') as HTMLElement
			const event = new KeyboardEvent('keydown', {
				key: 'Tab',
				bubbles: true,
				cancelable: true,
			})
			grid.dispatchEvent(event)
			await wrapper.vm.$nextTick()

			// Roving stop unchanged: still index 0 with tabindex=0.
			const items = document.querySelectorAll('[role="menuitem"]')
			expect(items[0].getAttribute('tabindex')).toBe('0')
			// Handler must not call preventDefault() on Tab -- the browser
			// needs the default behavior to move focus out of the grid.
			expect(event.defaultPrevented).toBe(false)
		})
	})

	describe('focus return on close', () => {
		// focus-trap doesn't activate in jsdom (needs layout), so we can't assert
		// on document.activeElement. Instead we call returnFocusTarget() directly
		// (the same method NcPopover calls on deactivation) and verify openedFrom
		// is cleared after close.
		it('returnFocusTarget points at the waffle when opened from the waffle', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await wrapper.get('.app-menu__waffle').trigger('click')

			const waffle = wrapper.get('.app-menu__waffle').element
			expect(wrapper.vm.returnFocusTarget()).toBe(waffle)
		})

		it('returnFocusTarget points at the current-app button when opened from it', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await wrapper.get('.app-menu__current-app').trigger('click')

			const currentApp = wrapper.get('.app-menu__current-app').element
			expect(wrapper.vm.returnFocusTarget()).toBe(currentApp)
		})

		it('returnFocusTarget falls back to the waffle after the popover finishes closing', async () => {
			const wrapper = mount(AppMenu, { attachTo: document.body })
			await wrapper.get('.app-menu__current-app').trigger('click')
			const currentApp = wrapper.get('.app-menu__current-app').element
			expect(wrapper.vm.returnFocusTarget()).toBe(currentApp)

			// Trigger after-hide directly: focus-trap and transitions don't run in jsdom.
			wrapper.findComponent({ name: 'NcPopover' }).vm.$emit('after-hide')
			await wrapper.vm.$nextTick()

			const waffle = wrapper.get('.app-menu__waffle').element
			expect(wrapper.vm.returnFocusTarget()).toBe(waffle)
		})
	})
})
