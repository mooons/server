<!--
  - SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<template>
	<nav class="app-menu" :aria-label="t('core', 'Applications')">
		<NcPopover
			:shown="opened"
			:triggers="[]"
			placement="bottom-start"
			:distance="8"
			:skidding="-82"
			popoverBaseClass="app-menu__popover-base"
			@show="opened = true"
			@hide="opened = false">
			<template #trigger>
				<NcButton
					class="app-menu__waffle"
					variant="tertiary-no-background"
					:aria-label="t('core', 'Open apps menu')"
					aria-haspopup="menu"
					:aria-expanded="opened ? 'true' : 'false'"
					@click="opened = !opened">
					<template #icon>
						<IconDotsGrid :size="20" />
					</template>
				</NcButton>
			</template>

			<div
				class="app-menu__popover"
				role="menu"
				:aria-label="t('core', 'Apps')">
				<div class="app-menu__grid">
					<AppItem
						v-for="app in appList"
						:key="app.id"
						:app="app"
						:newTab="true" />
					<AppItem
						v-if="isAdmin"
						:app="moreAppsEntry"
						:newTab="true"
						:outlined="true" />
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
			@click="opened = !opened">
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
import { n, t } from '@nextcloud/l10n'
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
		}
	},

	computed: {
		currentApp(): INavigationEntry | undefined {
			return this.appList.find((app) => app.active)
		},

		moreAppsEntry(): INavigationEntry {
			return {
				id: 'more-apps',
				active: false,
				order: Number.MAX_SAFE_INTEGER,
				href: generateUrl('/settings/apps'),
				icon: generateFilePath('settings', 'img', 'apps.svg'),
				type: 'link',
				name: t('core', 'More apps'),
				unread: 0,
			}
		},
	},

	mounted() {
		subscribe('nextcloud:app-menu.refresh', this.setApps)
	},

	beforeUnmount() {
		unsubscribe('nextcloud:app-menu.refresh', this.setApps)
	},

	methods: {
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
		},
	},
})
</script>

<style scoped lang="scss">
.app-menu {
	display: flex;
	align-items: center;

	&__triggers {
		display: flex;
		align-items: center;
		gap: var(--default-grid-baseline);
	}

	&__waffle {
		// NcButton's tertiary-no-background variant uses --color-main-text,
		// which is dark on light themes. The header sits on the theme primary
		// background, so override to use the matching plain-text color.
		--color-main-text: var(--color-background-plain-text);
		color: var(--color-background-plain-text);

		:deep(.button-vue) {
			color: var(--color-background-plain-text);
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

		&:hover,
		&:focus-visible {
			// The header sits on the theme-primary background with white text,
			// so --color-background-hover (white-ish) collapses contrast.
			// A translucent black overlay reads on any header tint.
			background: rgba(0, 0, 0, 0.1);
		}

		&:focus-visible {
			outline: 2px solid var(--color-primary-element);
			outline-offset: 2px;
		}
	}

	&__current-app-icon {
		width: 20px;
		height: 20px;
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
		padding: calc(var(--default-grid-baseline) * 6) calc(var(--default-grid-baseline) * 4);
		max-width: calc(100vw - var(--default-grid-baseline) * 4);
	}

	&__grid {
		--app-item-col-width: 65px;
		--app-item-row-height: 66px;
		--app-menu-rows-visible: 3;
		display: grid;
		grid-template-columns: repeat(4, var(--app-item-col-width));
		grid-auto-rows: minmax(var(--app-item-row-height), max-content);
		// gap: var(--default-grid-baseline);
		max-height: calc(var(--app-item-row-height) * var(--app-menu-rows-visible));
		overflow-y: auto;
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
</style>
