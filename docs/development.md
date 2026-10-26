# Starting Blocks Admin App Developer's Guide

- [Starting Blocks Admin App Developer's Guide](#starting-blocks-admin-app-developers-guide)
  - [Creating Releases](#creating-releases)
    - [Naming Pull Requests (PRs) and the Semantic Workflow](#naming-pull-requests-prs-and-the-semantic-workflow)
    - [Versioning](#versioning)
    - [Breaking Changes](#breaking-changes)
    - [Note on branch names and commit messages](#note-on-branch-names-and-commit-messages)
  - [Running locally](#running-locally)
    - [Environment](#environment)
    - [External dependencies](#external-dependencies)
    - [Send it](#send-it)
    - [Connecting to AWS](#connecting-to-aws)
      - [Browser doesn't open for AWS CLI](#browser-doesnt-open-for-aws-cli)
  - [Creating and running migrations](#creating-and-running-migrations)
  - [Possible issues](#possible-issues)
  - [Using a machine user](#using-a-machine-user)
  - [Random things](#random-things)
  - [Swagger/OpenAPI Documentation](#swaggeropenapi-documentation)
    - [Local Development](#local-development)
    - [Production Environment](#production-environment)
    - [Troubleshooting](#troubleshooting)
  - [Architecture overview](#architecture-overview)
  - [M2M Users](#m2m-users)
    - [Auth0 Application creation](#auth0-application-creation)

## Creating Releases

1. Create a PR from `develop` to `main` and name it `chore: cut release`
2. When merging a release PR, **always** click `Create a merge commit`
   1. This ensures that each commit gets individually added to the git history

### Naming Pull Requests (PRs) and the Semantic Workflow

To take advantage of semantic-release, commits that make it into main and develop should be named with a specific prefix. These prefixes let semantic-release know how to update the version appropriately.

When creating PRs, give it a name of `[prefix]: [specific work]`. For example, a PR to update documentation would be `docs: added testing instructions`

When merging PRs into `develop`, always click `Squash and merge`. This ensures that only a single commit gets merged in and gives you the chance to rename it. Check that this commit message has the same format and the PR number in parentheses. So continuing the docs example with a PR numbered 99999, it should be `docs: added testing instructions (#99999)`.

Possible prefixes are listed here, and what they are meant to be for.

| Prefix         | Description                                        | Release Type |
| -------------- | -------------------------------------------------- | ------------ |
| `feature:`     | New features, like adding a new field to a form    | minor        |
| `fix:`         | Bug fixes                                          | patch        |
| `performance:` | Performance improvements                           | patch        |
| `style:`       | Code style changes, like linting                   | patch        |
| `revert:`      | Undoing previous commits, usually via `git revert` | patch        |
| `docs:`        | Updating docs                                      | none         |
| `chore:`       | Small changes where nothing else fits              | none         |
| `refactor:`    | Improving code logic                               | patch        |
| `test:`        | Adding or updating tests                           | none         |
| `build:`       | Changing the build system                          | none         |
| `ci:`          | Improving the CI                                   | none         |

### Versioning

Semantic version (or semver) is when a version consists of 3 numbers separated by a dot like this `1.15.0`.

The first number (`1` in this case) is the major version. This only changes if functionality breaks previous usage, usually if something is removed.

The second number (`15` in this case) is the minor version. This is incremented whenever new features are added.

The third number (`0` in this case) is the patch. This is incremented whenever small changes are made.

### Breaking Changes

Typically, we want to avoid breaking changes, hence why there is no prefix for this. To indicate a breaking change, the words `BREAKING CHANGE:` (in all caps) must be added into the body of a commit message.

### Note on branch names and commit messages

Using `Squash and merge` on PRs into `develop` gives developers the flexibility to be more flexible in how they work. Branches off of `develop` can be named anything and commit messages can contain anything. It is recommended that you still write somewhat reasonable messages for the purposes of seeing what's been done on a PR, but it won't cause issues if a commit message is written in a non-semantic format.

## Running locally

Once you've followed the setup instructions below, you can do the following in two different terminal windows

1. Run `./run-docker.sh`
   1. This currently assumes that you have repo folders named `startingblocks_admin_app` and `keycloak_local_idp_se` in the same folder named `code`. I am working on making this configurable.
2. Run `npm start`
   1. This will run both `api` and `fe` in the same terminal window. If you wish to keep the output separate, run `npm run start:api:dev` and `npm run start:fe:dev` in separate terminals instead.

### Environment

Duplicate the `.copyme` files at the following locations, removing that part of the name:

- [packages/fe/.copyme.env.local](./packages/fe/.copyme.env.local)
- [packages/api/config/local-development.js.copyme](./packages/api/config/local-development.js.copyme)

  - Generate for yourself a new encryption key to be used in the config file above. This is used to encrypt (at rest) the Ed-Fi Admin API credentials.

    ```shell
    node -e "console.log('KEY: '+ require('crypto').randomBytes(32).toString('hex'))"
    ```

  - Note the `ADMIN_USERNAME` option which you can use to avoid seeding a user in Postgres directly. This should match something you either have or will create in Keycloak.

Go to [AWS](https://edanalytics.awsapps.com/start#/). Under the `EA EdFi` account, log into a profile with command line or programmatic access. Notice the hint about `aws configure sso`. Do whatever option you want, but the goal is just to end up with the NodeJS AWS library able to log in in any of its totally standard ways. The simplest option is to go to the terminal where you will try to run the server, and paste and execute the first code block from the AWS login screen (`export AWS_ACCESS_KEY_ID=...`). Then when you start the server it will have those values available in the environment. Again, this is standard AWS stuff not particular to SBAA at all, so see other sources for more info.

### External dependencies

**Keycloak as an identity provider:**

1. Clone the [local IdP repo](https://github.com/edanalytics/keycloak_local_idp_se.git):

   ```shell
   git clone https://github.com/edanalytics/keycloak_local_idp_se.git
   ```

1. Copy the [sbaa-keycloak-config.local.yml](./sbaa-keycloak-config.local.yml) file from this repository into the `/config` folder of the IdP one. This new file adds a "Starting Blocks Admin App" identity client to the Realm set up by the default `config.yml` file that will already be there.
1. In the IdP repo, run `docker compose up`.
1. (optional) Go to [http://localhost:8080/realms/example/account](http://localhost:8080/realms/example/account) and log in with one of the credentials suggested by Keeper (teacher, principal, or admin). **_Or_**, go to <http://localhost:8080/admin/master/console/#/example/users> and impersonate one.

You now have a local identity provider running with a configuration that matches what's in the `SAMPLE_OIDC_CONFIG` variable you set up in the preceding section.

**VS Code extensions:**

1. Install the VS Code extensions recommended for this repository.

### Send it

1. Run `docker compose up` in this repo to start Postgres.
1. Run `npm i`
1. Find the `serve` _"Generate & run target"_ in the Nx Console extension, and use it to run the app (you may have to click the &#x21BB; button to the right of that heading in order to see `serve` appear):

   - API
   - FE

   _(Or run `npx nx run fe:serve` and `npx nx run api:serve` in two shells)_

1. Go to [http://localhost:4200](http://localhost:4200) and log in.
1. Start Storybook if you want with the Nx `storybook` target

### Connecting to AWS

1. Install the [AWS Command Line Interface (CLI)](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2. Run `aws configure sso`
   1. For session name, call it whatever you like
   2. For start URL, put `https://edanalytics.awsapps.com/start/#`
   3. For region, put `us-east-2`
3. Run `aws sso login`
   1. This should open a browser to login to AWS, if it does not, see below
4. Follow the login prompts in the browser

#### Browser doesn't open for AWS CLI

If your browser isn't opening from WSL and you get a `gio: AWS_URL: operation not supported error`, try this

1. Run `sudo add-apt-repository ppa:wslutilities/wslu`
2. Run `sudo apt-get update`
3. Run `sudo apt install wslu`

## Creating and running migrations

1. Run `npm run migrations:generate -- MigrationNameHere`
   1. Name your migration so its easy to understand what it does. This also puts it in the correct folder.
2. Check the migration has appeared under [packages/api/src/database/migrations](packages/api/src/database/migrations) and with the name you gave it
   1. If it has, continue
   2. If it has not appeared under the above folder, move the migration to the above folder
   3. If it has a generic name like `migration`, change the following
      - the filename
      - the classname in the file
      - the name variable in the file
3. Run `npm run migrations:run`

If you need to revert a migration, you can run the following

```shell
npm run migrations:revert
```

## Possible issues

> - You can only log in if SBAA is successfully connected to some IdP. Check the `oidc` table and check your IdP.
> - For the Ed-Fi compose setup, the seeded OIDC client secret is the value of `KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET` (container client `edfiadminapp`) or `KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET` (hot-reload client `edfiadminapp-dev`) from `compose/.env`. In `local.js`, `DB_SECRET_VALUE.DB_PASSWORD` must equal `POSTGRES_PASSWORD` and `SAMPLE_OIDC_CONFIG.clientSecret` must equal `KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET`.
> - You can only log in if the database has been populated with a user and that user is active and has a role.
> - There's not much to do until the app has some data in it.
> - CORS: You can access the app either via hostname (`localhost`) or IP (`127.0.0.1`), but your `FE_URL` config value will only match one of those. Make sure you don't wind up putting one in your config file but the other in your browser.

## Using a machine user

1. Login with the machine user via auth0 directly (a curl example is below)

   ```bash
   curl \
   --header "Content-Type: application/json" \
   --request POST \
   --data '{ "audience": "AUDIENCE", "grant_type": "client_credentials", "client_id": "CLIENT_ID", "client_secret": "CLIENT_SECRET" }' \
   'SOME_AUTH0_URL'
   ```

2. This will give you a bearer token
3. Call an endpoint with the token (a curl example is below)

   1. This token is decoded to retrieve a client ID
   2. The client ID is used to find the relevant machine user

   ```bash
   curl \
   --header 'authorization: Bearer BEARER_TOKEN' \
   --request GET \
   'SBAA_URL/api/auth/me'
   ```

## Random things

- You'll get a file called `/sbaa-swagger.json` generated when the server starts if you have that enabled in your config variables. That's the OpenAPI spec served at the `/api` route.
- You'll get a file called `/stats.html` generated when the front-end builds in production mode. That's the output of a bundle analyzer to help with getting rid of dependency cruft that the front end has to (slowly) load.
- If you don't have the needed AWS access, the app can still run. It just won't be able to do the particular operations that try to execute lambdas.
  
## Swagger/OpenAPI Documentation

### Local Development

The API includes Swagger UI for exploring and testing endpoints during local development.

**To enable Swagger UI:**

1. Set `ENABLEENABLE_OPEN_API: true` in your `packages/api/config/local.js` file (already enabled by default in local config)
2. Start the API server in development mode:

   ```shell
   npm run start:api:dev
   ```

3. Navigate to `http://localhost:3333/api` to access the interactive Swagger UI

**Configuration Options:**

- **Environment Variable:** Set `OPEN_API=true` in your environment
- **Config File:** Set `ENABLEENABLE_OPEN_API: true` in your configuration file
- **Default:** Disabled (`false`) in `packages/api/config/default.js`

### Production Environment

⚠️ **CRITICAL SECURITY WARNING**

**Swagger UI is disabled by default and must NEVER be enabled in production environments.**

API documentation exposure represents a significant security risk because it reveals:

- Complete API endpoint structure and attack surface
- Request/response schemas and data models
- Authentication patterns and security mechanisms
- Business logic and authorization models
- Multi-tenant resource patterns

**Security Safeguards:**

The application includes multiple layers of protection:

1. **Default Configuration:** `OPEN_API` defaults to `false` in base configuration
2. **Production Config:** Explicitly sets `ENABLE_OPEN_API: false` in production configuration
3. **Runtime Guard:** If `OPEN_API` is enabled, Swagger is blocked at runtime when `NODE_ENV=production`
4. **Warning Logging:** A warning is logged if Swagger is disabled due to production environment

**Testing the Safeguard:**

To verify the production safeguard is working:

```shell
# This should block Swagger and show a warning
npm run start:api
# Expected log: "Swagger UI is disabled in production environment for security reasons."
```

**Best Practices:**

- ✅ Use Swagger in local development for API exploration
- ✅ Keep `OPEN_API=false` in all non-local environments
- ✅ Never set `OPEN_API=true` in staging or production
- ✅ Verify Swagger is inaccessible in deployed environments

### Troubleshooting

**Swagger not loading in development:**

1. Verify `ENABLE_OPEN_API: true` in your config file
2. Check that you're using the development command: `npm run start:api:dev`
3. Confirm `NODE_ENV` is not set to `production`

**Getting 404 on /api route:**

- If you see "Cannot GET /api", Swagger is disabled
- Check your environment with the debug logs that show `NODE_ENV` and `config.OPEN_API` values

## Architecture overview

An overview of the architecture can be found [here](docs/architecture.md)

## M2M Users

SBAA has a concept of machine users. They're rows in the main user table, but their login mechanism is different. Each one is tied to an Auth0 "Application" by Client ID, and you request tokens from Auth0 using that application's credentials. Then when you make an SBAA API request with the access token (`Authorization: Bearer <token>`), SBAA looks up the machine user record by that Client ID and attaches it to the app logic just like it does for the normal cookie-based human users.

### Auth0 Application creation

> [!NOTE]
> The link to this section specifies a commit so we don't have to worry about rot, but you might want to check this [same location on `main`](https://github.com/edanalytics/startingblocks_admin_app/?tab=readme-ov-file#auth0-application-creation) for updates.

An Application needs to be created by hand in Auth0, and then the Client ID entered in SBAA's machine user creation form. Create them like this:

1. Choose the `Machine to machine applications` type
1. Enter a name
1. Once created, switch to the `APIs` tab of the application's page
1. Turn on the `Authorized` toggle for SBAA
1. Expand the dropdown and check the `login:app` scope
1. Go to the `Settings` tab and retrieve the Client ID for use in SBAA's form. Copy one of the language-specific code blocks from the `Quickstart` tab and share it with the ultimate user of the machine registration.
