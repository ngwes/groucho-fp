# groucho-fp documentation site

A [Starlight](https://starlight.astro.build) site, published to GitHub Pages at <https://ngwes.github.io/groucho-fp/>.

The content is **not** stored here. The repository `README.md` is the single source of truth (and keeps rendering on
GitHub and npm). `scripts/sync-content.mjs` turns it into the site's content before every build: it splits it into one
page per `##` section, adds the page titles as front matter, keeps the links between sections working by pointing them
at the page that holds the heading, and drops the table of contents (the sidebar replaces it). The generated files
(`src/content/docs/`) are git-ignored. To change the documentation, edit the README.

Content that belongs to the README only (such as the link to this site) goes between the
`<!-- docs-site:skip-start -->` and `<!-- docs-site:skip-end -->` markers: it is removed from the site.

## Commands

Run from this folder:

| Command           | What it does                                                       |
| :---------------- | :----------------------------------------------------------------- |
| `npm install`     | Install dependencies                                               |
| `npm run dev`     | Sync the content, then serve the site at `localhost:4321/groucho-fp/` |
| `npm run sync`    | Re-sync the content after editing the README during `dev`          |
| `npm run build`   | Sync the content, build the site into `./dist/` and check its links |
| `npm run preview` | Serve the built site locally                                       |

`npm run build` fails when a link points to a page or an anchor that does not exist
([starlight-links-validator](https://github.com/HiDeoo/starlight-links-validator)). The validator only checks absolute
links, so the sync script generates links that include the `base` (see `site.mjs`).

## Deployment

`.github/workflows/deploy-docs.yml` builds the site for every pull request and deploys it on every push to `main` that
touches the README or this folder. It needs **Settings → Pages → Source: GitHub Actions** to be enabled once on the
repository.
