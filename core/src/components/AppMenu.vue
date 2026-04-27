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
			@show="opened = true"
			@hide="opened = false">
			<template #trigger>
				<NcButton
					ref="trigger"
					class="app-menu__trigger"
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
						new-tab />
					<AppItem
						v-if="isAdmin"
						:app="moreAppsEntry"
						new-tab />
				</div>
			</div>
		</NcPopover>
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

	beforeDestroy() {
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

	&__trigger {
		color: var(--color-background-plain-text);
	}

	&__popover {
		padding: calc(var(--default-grid-baseline) * 2);
		max-width: calc(var(--default-grid-baseline) * 60);
	}

	&__grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: var(--default-grid-baseline);
	}
}
</style>
