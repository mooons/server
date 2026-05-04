/*!
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { INavigationEntry } from '../../types/navigation.d.ts'

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

// Mock @nextcloud/l10n so the unread-count assertion is deterministic
// regardless of locale data. `n()` is the plural form: in real code it
// returns the singular when count===1, plural otherwise. We mirror that.
vi.mock('@nextcloud/l10n', () => ({
	t: (_app: string, text: string) => text,
	n: (_app: string, singular: string, plural: string, count: number, vars?: Record<string, unknown>) => {
		const template = count === 1 ? singular : plural
		// AppItem passes { count }; substitute it like @nextcloud/l10n does.
		return template.replace(/\{count\}/g, String(vars?.count ?? count))
	},
}))

import AppItem from '../../components/AppItem.vue'

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

describe('core: AppItem', () => {
	it('renders the label', () => {
		const wrapper = mount(AppItem, { propsData: { app: makeApp({ name: 'Files' }) } })
		expect(wrapper.text()).toContain('Files')
	})

	it('active app has aria-current="page"', () => {
		const wrapper = mount(AppItem, { propsData: { app: makeApp({ active: true }) } })
		expect(wrapper.attributes('aria-current')).toBe('page')
	})

	it('inactive app has no aria-current', () => {
		const wrapper = mount(AppItem, { propsData: { app: makeApp({ active: false }) } })
		// Vue binds `aria-current` to undefined when inactive; the attribute
		// must be absent (not "false"), or screen readers misread.
		expect(wrapper.attributes('aria-current')).toBeUndefined()
	})

	it('newTab prop renders target="_blank" rel="noopener noreferrer"', () => {
		const wrapper = mount(AppItem, {
			propsData: { app: makeApp(), newTab: true },
		})
		expect(wrapper.attributes('target')).toBe('_blank')
		expect(wrapper.attributes('rel')).toBe('noopener noreferrer')
	})

	it('newTab=false omits target and rel', () => {
		const wrapper = mount(AppItem, {
			propsData: { app: makeApp(), newTab: false },
		})
		expect(wrapper.attributes('target')).toBeUndefined()
		expect(wrapper.attributes('rel')).toBeUndefined()
	})

	it('unread label uses singular form for 1 unread', () => {
		const wrapper = mount(AppItem, {
			propsData: { app: makeApp({ unread: 1 }) },
		})
		// hidden-visually span carries the screen-reader announcement.
		const sr = wrapper.find('.hidden-visually')
		expect(sr.exists()).toBe(true)
		expect(sr.text()).toContain('1 notification')
		expect(sr.text()).not.toContain('notifications')
	})

	it('unread label uses plural form for 2 unread', () => {
		const wrapper = mount(AppItem, {
			propsData: { app: makeApp({ unread: 2 }) },
		})
		const sr = wrapper.find('.hidden-visually')
		expect(sr.exists()).toBe(true)
		expect(sr.text()).toContain('2 notifications')
	})
})
