// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { base } from './site.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://ngwes.github.io',
	base,
	integrations: [
		starlight({
			title: 'groucho-fp',
			description:
				'A functional pipeline library for TypeScript, built on @ngwes/mini-fp: sequential steps over a shared context, explicit hooks for errors, and steps loaded dynamically from the filesystem.',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ngwes/groucho-fp' },
				{ icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/@ngwes/groucho-fp' },
			],
			// Fails the build on a broken page or anchor link. It only checks absolute links (with the
			// `base`), which is what the sync script generates.
			plugins: [starlightLinksValidator()],
			sidebar: [
				{ label: 'Start here', slug: 'index' },
				{ label: 'Documentation', items: [{ autogenerate: { directory: 'guide' } }] },
			],
		}),
	],
});
