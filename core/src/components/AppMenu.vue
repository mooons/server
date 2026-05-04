<!--
  - SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<nav class="app-menu" :aria-label="t('core', 'Applications')">
		<NcPopover
			ref="popover"
			:shown="opened"
			:triggers="[]"
			placement="bottom-start"
			:distance="30"
			:skidding="popoverSkidding"
			:setReturnFocus="returnFocusTarget"
			popoverBaseClass="app-menu__popover-base"
			popupRole="menu"
			@update:shown="opened = $event">
			<template #trigger>
				<NcButton
					class="app-menu__waffle"
					variant="tertiary-no-background"
					:aria-label="t('core', 'Open apps menu')"
					aria-haspopup="menu"
					:aria-expanded="opened ? 'true' : 'false'"
					@click="onTriggerClick('waffle')">
					<template #icon>
						<IconDotsGrid :size="20" />
					</template>
				</NcButton>
			</template>

			<div
				class="app-menu__popover"
				role="menu"
				:aria-label="t('core', 'Apps')">
				<div class="app-menu__grid" @keydown="onGridKeydown">
					<AppItem
						v-for="(item, i) in gridItems"
						:key="item.id"
						ref="items"
						:app="item"
						:newTab="openInNewTab"
						:outlined="item.id === 'more-apps'"
						:tabindex="i === focusedIndex ? 0 : -1" />
				</div>
			</div>
		</NcPopover>
		<button
			v-if="currentApp"
			class="app-menu__current-app"
			type="button"
			:aria-label="t('core', 'Open apps menu')"
			aria-haspopup="menu"
			:aria-expanded="opened ? 'true' : 'false'"
			@click="onTriggerClick('currentApp')">
			<img
				class="app-menu__current-app-icon"
				:src="currentApp.icon"
				alt=""
				aria-hidden="true">
			<span class="app-menu__current-app-name">
				{{ currentApp.name }}
			</span>
		</button>
	</nav>
</template>

<script lang="ts">
import type { INavigationEntry } from '../types/navigation.d.ts'

import { subscribe, unsubscribe } from '@nextcloud/event-bus'
import { loadState } from '@nextcloud/initial-state'
import { isRTL, n, t } from '@nextcloud/l10n'
import { generateFilePath, generateUrl } from '@nextcloud/router'
import { defineComponent, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcPopover from '@nextcloud/vue/components/NcPopover'
import IconDotsGrid from 'vue-material-design-icons/DotsGrid.vue'
import AppItem from './AppItem.vue'
import { isUserAdmin } from '../OC/admin.js'
import logger from '../logger.js'

export default defineComponent({
	name: 'AppMenu',

	components: {
		AppItem,
		IconDotsGrid,
		NcButton,
		NcPopover,
	},

	setup() {
		const opened = ref(false)
		return {
			t,
			n,
			opened,
		}
	},

	data() {
		const appList = loadState<INavigationEntry[]>('core', 'apps', [])
		return {
			appList,
			isAdmin: isUserAdmin(),
			// Roving tabindex: only the tile at this index has tabindex=0,
			// every other tile has tabindex=-1. Arrow keys move it; Tab
			// then takes focus out of the grid as a whole.
			focusedIndex: 0,
			// Tracks which trigger opened the popover so we can return
			// focus to the right one on close. NcPopover's built-in
			// focus-trap only knows about the slot trigger (the waffle);
			// the current-app button lives outside the slot, so we
			// restore focus manually in onPopoverHide.
			openedFrom: null as 'waffle' | 'currentApp' | null,
			// Synthetic tile that takes admins to the app store. Not part
			// of `appList` because it isn't a registered nav entry.
			moreAppsEntry: {
				id: 'more-apps',
				active: false,
				order: Number.MAX_SAFE_INTEGER,
				href: generateUrl('/settings/apps'),
				icon: generateFilePath('settings', 'img', 'apps.svg'),
				type: 'link',
				name: t('core', 'More apps'),
				unread: 0,
			} as INavigationEntry,
			// Cross-axis offset for the popover. Floating UI's skidding sign
			// stays consistent regardless of writing direction (positive
			// shifts toward the main-axis-end), so the LTR value -82 (which
			// tucks the popover under the logo on the start side) must be
			// mirrored to +82 under RTL. `placement: bottom-start` on its own
			// already swaps the anchor edge, but the skidding offset isn't
			// auto-mirrored. Snapshot at init: Nextcloud's language can't
			// change at runtime, so a single read is correct.
			popoverSkidding: isRTL() ? 82 : -82,
		}
	},

	computed: {
		currentApp(): INavigationEntry | undefined {
			return this.appList.find((app) => app.active)
		},

		// Open links in the same tab when launching from Dashboard, new tab
		// otherwise. Mirrors Google's behavior and the design decision in #59888.
		openInNewTab(): boolean {
			return this.currentApp?.id !== 'dashboard'
		},

		// Single ordered list of every tile rendered in the grid. The roving
		// `focusedIndex` is an index into this list, so keep ordering stable
		// and include the optional "More apps" tile when admin.
		gridItems(): INavigationEntry[] {
			return this.isAdmin ? [...this.appList, this.moreAppsEntry] : [...this.appList]
		},
	},

	watch: {
		// On open, place the roving stop on the active app (if any) so a
		// keyboard user lands on "you are here" rather than the first tile.
		opened(isOpen: boolean) {
			if (isOpen) {
				this.focusedIndex = this.activeGridIndex()
			}
		},
	},

	mounted() {
		subscribe('nextcloud:app-menu.refresh', this.setApps)
		// Pre-seed the roving stop so the initial render already has
		// tabindex=0 on the right tile, before the popover opens.
		this.focusedIndex = this.activeGridIndex()
		// Subscribe to NcPopover's `after-hide` event via $on rather than a
		// template `@after-hide` listener: the lint rule forbids hyphenated
		// v-on names in this codebase, but NcPopover v8 emits the event with
		// the kebab-case name and Vue 2 doesn't auto-normalize, so a
		// camelCase template listener never fires.
		;(this.$refs.popover as { $on: (e: string, fn: () => void) => void }).$on('after-hide', this.onPopoverAfterHide)
	},

	beforeUnmount() {
		unsubscribe('nextcloud:app-menu.refresh', this.setApps)
		;(this.$refs.popover as { $off: (e: string, fn: () => void) => void } | undefined)?.$off('after-hide', this.onPopoverAfterHide)
	},

	methods: {
		// NcPopover's focus-trap calls this on deactivation to decide where
		// to restore focus. Without it, NcPopover defaults to its slot
		// trigger (the waffle), so opening from the current-app button and
		// closing would jump focus to the wrong trigger. Returning the
		// element chosen by `openedFrom` keeps the round-trip symmetric.
		// Default to waffle for any external open path (it's always rendered;
		// the current-app button only renders when there's an active app).
		returnFocusTarget(): HTMLElement | null {
			return this.openedFrom === 'currentApp'
				? this.$el.querySelector('.app-menu__current-app')
				: this.$el.querySelector('.app-menu__waffle')
		},

		// NcPopover emits `after-hide` once the popover has fully closed
		// (focus-trap already deactivated, content unmounted). Focus return
		// is handled by `setReturnFocus` above; this hook only clears the
		// trigger source so the next open starts from a clean state.
		onPopoverAfterHide() {
			this.openedFrom = null
		},

		onTriggerClick(source: 'waffle' | 'currentApp') {
			this.openedFrom = source
			this.opened = !this.opened
		},

		setNavigationCounter(id: string, counter: number) {
			const app = this.appList.find(({ app }) => app === id)
			if (app) {
				app.unread = counter
			} else {
				logger.warn(`Could not find app "${id}" for setting navigation count`)
			}
		},

		setApps({ apps }: { apps: INavigationEntry[] }) {
			this.appList = apps
			if (this.focusedIndex >= this.gridItems.length) {
				this.focusedIndex = this.activeGridIndex()
			}
		},

		// Index of the active app within `gridItems`, or 0 if none is active.
		activeGridIndex(): number {
			const idx = this.gridItems.findIndex((app) => app.active)
			return idx === -1 ? 0 : idx
		},

		// Roving-tabindex keyboard contract for the launcher grid.
		// Arrow keys clamp at edges (no wrap), matching the WAI-ARIA grid
		// pattern. Tab is intentionally NOT handled so the browser's native
		// focus order moves out of the grid.
		async onGridKeydown(event: KeyboardEvent) {
			// Let modifier-bearing key combos fall through to the browser.
			// Shift is included so Shift+Enter opens the link in a new tab
			// via the browser's native modifier-aware <a> activation.
			if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
				return
			}

			if (this.gridItems.length === 0) {
				return
			}

			const cols = 4
			const total = this.gridItems.length
			const i = this.focusedIndex
			let next = i

			switch (event.key) {
				case 'ArrowRight': {
					// Stay put if already at the right edge of the row OR the
					// last item; never wrap to the next row.
					const atRowEnd = (i % cols) === cols - 1
					if (!atRowEnd && i + 1 < total) {
						next = i + 1
					}
					break
				}
				case 'ArrowLeft': {
					const atRowStart = (i % cols) === 0
					if (!atRowStart) {
						next = i - 1
					}
					break
				}
				case 'ArrowDown': {
					// Strict edge-clamp: if the cell directly below doesn't
					// exist (partial bottom row), stay put.
					if (i + cols < total) {
						next = i + cols
					}
					break
				}
				case 'ArrowUp': {
					if (i - cols >= 0) {
						next = i - cols
					}
					break
				}
				case 'Home':
					next = 0
					break
				case 'End':
					next = total - 1
					break
				case 'Enter':
				case ' ': {
					// Activate the focused tile and close the launcher.
					// Native <a> activation works for Enter but not Space; for
					// Space the default browser action is to scroll the
					// nearest scrollable ancestor (the popover itself), so we
					// must intercept and click programmatically. Doing the
					// same for Enter keeps the behavior uniform and lets us
					// close the popover after activation.
					const items = this.$refs.items as Array<{ $el: HTMLElement }> | undefined
					items?.[this.focusedIndex]?.$el?.click()
					this.opened = false
					event.preventDefault()
					event.stopPropagation()
					return
				}
				default:
					// Tab and every other key falls through untouched.
					return
			}

			// stopPropagation prevents the keydown from bubbling out of the
			// teleported popover to document-level listeners (e.g. the Files
			// app's keyboard shortcuts), which would otherwise navigate the
			// background view at the same time the launcher grid moves focus.
			event.preventDefault()
			event.stopPropagation()
			if (next !== i) {
				this.focusedIndex = next
			}

			// Wait for the tabindex update to land before moving focus, so
			// the destination tile is in a coherent state when we focus it.
			await this.$nextTick()
			const items = this.$refs.items as Array<{ $el: HTMLElement }> | undefined
			items?.[this.focusedIndex]?.$el?.focus()
		},
	},
})
</script>

<style scoped lang="scss">
.app-menu {
	display: flex;
	align-items: center;

	&__waffle {
		// NcButton's tertiary-no-background variant uses --color-main-text,
		// which is dark on light themes. The header sits on the theme primary
		// background, so override to use the matching plain-text color.
		--color-main-text: var(--color-background-plain-text);
		color: var(--color-background-plain-text);

		// Mirror the current-app trigger's hover/active/focus feedback so
		// both popover triggers behave identically.
		//
		// `class="app-menu__waffle"` on <NcButton> gets merged onto the
		// component's root <button> element (same one with `.button-vue`),
		// so we style it directly — `:deep()` here would compile to a
		// descendant selector that never matches.
		//
		// !important defeats the v8 NcButton CSS in the legacy bundle which
		// sets `outline` and `box-shadow` on `:focus-visible` with
		// !important. Same defensive pattern as the current-app trigger's
		// :active rule.
		&:hover:not(:disabled) {
			background-color: rgba(0, 0, 0, 0.1) !important;
		}

		&:active:not(:disabled) {
			background-color: rgba(0, 0, 0, 0.15) !important;
		}

		&:focus-visible {
			background-color: rgba(0, 0, 0, 0.1) !important;
			outline: none !important;
			box-shadow: inset 0 0 0 2px var(--color-background-plain-text) !important;
		}
	}

	&__current-app {
		display: flex;
		align-items: center;
		gap: var(--default-grid-baseline);
		height: var(--default-clickable-area);
		padding-inline: calc(var(--default-grid-baseline) * 2);
		background: transparent;
		border: none;
		border-radius: var(--border-radius-element);
		color: var(--color-background-plain-text);
		cursor: pointer;
		// Suppress the mobile-Safari grey tap rectangle that briefly flashes on press.
		-webkit-tap-highlight-color: transparent;

		// The header sits on the theme-primary background with white text, so
		// --color-background-hover (white-ish) collapses contrast. A translucent
		// black overlay reads on any header tint.
		&:hover {
			background: rgba(0, 0, 0, 0.1);
		}

		// Override the global rule at core/css/inputs.scss:89 which sets
		// `button:not(:disabled, .primary):not(.app-navigation-entry-button):active`
		// to `background-color: var(--color-main-background)` — white on light
		// themes, which makes the masked icon read as white-on-white. !important
		// is needed because the global rule lives inside a deeply-chained
		// :not() selector that's hard to out-specify cleanly.
		&:active {
			background-color: rgba(0, 0, 0, 0.15) !important;
			color: var(--color-background-plain-text) !important;
		}

		// Inset box-shadow instead of an outline keeps the focus indicator
		// inside the rounded rectangle and reads softer than the previous
		// 2 px primary-color outline (which Jan flagged as a "white flash").
		&:focus-visible {
			background: rgba(0, 0, 0, 0.1);
			outline: none;
			box-shadow: inset 0 0 0 2px var(--color-background-plain-text);
		}
	}

	&__current-app-icon {
		width: calc(var(--default-grid-baseline) * 5);
		height: calc(var(--default-grid-baseline) * 5);
		// Match the old AppMenuIcon: theme-aware inversion plus a vertical
		// alpha gradient (defined in theming as --header-menu-icon-mask)
		// to give the icon a subtle fade toward the bottom.
		filter: var(--background-image-invert-if-bright);
		mask: var(--header-menu-icon-mask);
	}

	&__current-app-name {
		font-size: var(--default-font-size);
		font-weight: 500;
		white-space: nowrap;
		letter-spacing: -0.5px;
	}

	&__popover {
		max-width: calc(100vw - var(--default-grid-baseline) * 4);
		background-color: var(--color-main-background);
	}

	&__grid {
		--app-item-col-width: 69px;
		--app-item-row-height: 64px;
		--app-menu-rows-visible: 6;
		padding: calc(var(--default-grid-baseline) * 3) calc(var(--default-grid-baseline) * 2);
		display: grid;
		grid-template-columns: repeat(4, var(--app-item-col-width));
		grid-auto-rows: minmax(var(--app-item-row-height), max-content);
		max-height: calc(var(--app-item-row-height) * var(--app-menu-rows-visible) + var(--default-grid-baseline) * 5);
		overflow-y: auto;

		// Firefox understands the standard scrollbar properties directly here.
		// The WebKit equivalents live in the unscoped block at the bottom of
		// the file because Vue's scoped CSS doesn't always propagate the
		// data attribute onto ::-webkit-scrollbar pseudo-elements in Chrome.
		scrollbar-width: thin;
		scrollbar-color: var(--color-scrollbar) transparent;
	}
}
</style>

<!-- The popover content is teleported to <body>, so scoped styles can't
     reach it. The bundled NcPopover (legacy frontend, v8) reads
     `var(--border-radius-large)` on its wrapper/inner, so we override that
     token scoped to this popover. The newer 9.x line uses
     `--border-radius-element` instead, so we set both for forward-compat. -->
<style lang="scss">
.app-menu__popover-base {
	--border-radius-large: var(--border-radius-container-large);
	--border-radius-element: var(--border-radius-container-large);
}

// The override above is meant for NcPopover's outer wrapper (which reads
// --border-radius-element in 9.x); without a reset it cascades into our
// content and inflates AppItem's hover radius to match the popover. Restore
// the system default (apps/theming/css/default.css) so inner elements use
// the smaller, Dashboard-widget-like radius.
.app-menu__popover-base .app-menu__popover {
	--border-radius-element: 8px;
}

// Slim scrollbar for the apps grid. Lives outside the scoped block so the
// ::-webkit-scrollbar pseudo-elements bind reliably in Chrome. !important
// overrides the global rules in core/css/styles.scss, which otherwise force
// a 12 px thumb with a transparent border and content-box clip.
.app-menu__popover-base .app-menu__grid {
	scrollbar-width: thin !important;
	scrollbar-color: var(--color-scrollbar) transparent !important;

	&::-webkit-scrollbar {
		width: 6px !important;
		height: 6px !important;
	}

	&::-webkit-scrollbar-track {
		background: transparent !important;
	}

	&::-webkit-scrollbar-thumb {
		background-color: var(--color-scrollbar) !important;
		border: none !important;
		border-radius: 3px !important;
		background-clip: padding-box !important;
	}
}
</style>
