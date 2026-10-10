# Contributor instructions

- Keep this project generic. Never commit participant data, personal contacts,
  real credentials, live payment identifiers, generated passes, or private logs.
- Change sample data using fictional names and reserved example domains only.
- Keep payment verification on the server. A browser success callback alone
  cannot confirm a registration or issue an entry pass.
- Use disposable databases and fake providers in automated tests.
- Check affected screens on mobile and desktop before a release.
- Record useful test outcomes in docs/testing and state untested integrations.
- Run the publication privacy check before committing.
