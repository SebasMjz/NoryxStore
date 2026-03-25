# Contributing to AsteroAdmin

Contributions are always **welcome and recommended**! Here is how for beginner's: [Get started with open source click here](https://youtu.be/GbqSvJs-6W4)

1. Contribution Requirements:
   - When you contribute, you agree to give a non-exclusive license to AsteroDigital to use that contribution in any context as we (AsteroDigital) see appropriate.
   - If you use content provided by another party, it must be appropriately licensed using an [open source](https://opensource.org/licenses) license.
   - Contributions are only accepted through GitHub pull requests.
   - Finally, contributed code must work in all supported browsers (see README.md for browser support).
2. Installation:

   - Fork the repository ([here is the guide](https://help.github.com/articles/fork-a-repo/)).
   - Clone to your machine

   ```bash
   git clone https://github.com/YOUR_USERNAME/bootstrap-admin-template.git
   ```

   - Create a new branch from `main`

3. Compile dist files (Development):
   - To compile the dist files you need Node.js 18 or higher/npm (node package manager)
   - `npm install` (install npm deps)
   - `npm run dev` (developer mode, autocompile with browsersync support for live demo)
   - Make your changes only in `./src` folder
   - Do not make changes in `./dist/**` because it contains compiled files and should not be included in PR (Pull Request)
   - `npm run build` (compile css/js files and test all pages are working properly before creating a pull request)
4. Create a pull request to `main` branch

## Online one-click setup for contributing

You can use [GitHub Codespaces](https://docs.github.com/en/codespaces) or [Gitpod](https://www.gitpod.io/), online IDEs which are free for open source, for working on issues or making PRs (Pull Requests). With a single click it will launch a workspace and automatically:

- Clone the `AsteroAdmin` repo
- Install the dependencies
- Run `npm run dev` to start the development server

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=asterodigital/bootstrap-admin-template)
[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/asterodigital/bootstrap-admin-template)
