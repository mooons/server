/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { INavigationEntry } from '../../types/navigation.d.ts'

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mocks so they exist before the SFC's top-level imports run.
// `loadState` returns the apps list AppMenu reads on mount; `subscribers`
// is a manual pub/sub so we can fire 'nextcloud:app-menu.refresh' from a test.
const initialState = vi.hoisted(() => ({
	loadState: vi.fn(),
}))
vi.mock('@nextcloud/initial-state', () => initialState)

const adminMod = vi.hoisted(() => ({
	isUserAdmin: vi.fn(() => false),
}))
vi.mock('../../OC/admin.js', () => adminMod)

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
	adminMod.isUserAdmin.mockReturnValue(false)
	AppMenu = (await import('../../components/AppMenu.vue')).default
})

afterEach(() => {
	// NcPopover teleports to <body>; clear teleported nodes between tests.
	while (document.body.firstChild) {
		document.body.removeChild(document.body.firstChild)
	}
})

/**
 * Force the popover open so the teleported AppItem grid is in the DOM.
 *
 * NcPopover's content is teleported to <body>, so it isn't reachable via
 * `wrapper.find()`. We click the waffle trigger (the user-visible action
 * that toggles `opened`) and poll the document until at least one
 * teleported menuitem has rendered. `vi.waitFor` retries until the
 * assertion passes or its default 1000ms timeout elapses, which is more
 * robust than ad-hoc `setTimeout(0)` + `nextTick` flushes against
 * v-popper's async afterShow hook.
 */
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

		// AppItem renders `role="menuitem"`; non-admin = no "More apps" tile,
		// so 3 menuitems map 1:1 to fakeApps().
		const items = document.querySelectorAll('[role="menuitem"]')
		expect(items).toHaveLength(3)
		// `.app-item__label` is the user-visible label span; `title` is just
		// a hover tooltip and not part of the accessible name pipeline.
		const labels = Array.from(items).map((el) => el.querySelector('.app-item__label')?.textContent?.trim() ?? '')
		expect(labels).toEqual(['Files', 'Mail', 'Calendar'])
	})

	it('renders the "More apps" tile when isUserAdmin() returns true', async () => {
		adminMod.isUserAdmin.mockReturnValue(true)
		const wrapper = mount(AppMenu, { attachTo: document.body })
		await openPopover(wrapper)

		const items = document.querySelectorAll('[role="menuitem"]')
		expect(items).toHaveLength(4)
		// Identify the "More apps" tile by its user-visible label rather than
		// the BEM modifier class -- the class is an implementation detail.
		const moreApps = Array.from(items).find((el) => el.textContent?.includes('More apps'))
		expect(moreApps).toBeTruthy()
	})

	it('does NOT render "More apps" when isUserAdmin() returns false', async () => {
		adminMod.isUserAdmin.mockReturnValue(false)
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
})
