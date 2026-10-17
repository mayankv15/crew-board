# AI notes

## How I used it

An AI coding assistant, in my terminal and editor, for scaffolding (workspace, CI, Dockerfile), first drafts of schemas, SQL, screens and tests, and listing edge cases. I read, ran and changed what it wrote. Every decision the brief leaves open is mine and is written in the README; the assistant proposed options and I chose.

## Where it was wrong, and how I caught it

- **Green tests, broken product.** The first server bundle crashed on start while every test passed, because tests run the source. Running the real build in a browser also showed the data grid jumping back to page one and its styles blocked by the security policy.
- **Taste instead of measurement.** The first palette failed contrast for amber and put green beside red too close for colour-blind users. I scored it, fixed it, and a test now keeps it that way. An accessibility scan and a keyboard-only pass found two more problems that reading the code had not.
- **Version numbers from memory.** The newest TypeScript was not accepted by the linter, one library's `latest` was a release candidate, and an option name had been renamed. I checked the registry and pinned versions.
- **Partner data.** The HR API returns passwords, national ids and bank details. I looked at a real payload, wrote an allow-list, and tested that a planted fake SSN never reaches the database.

## What I would not trust it with

Security logic without tests that fail first; version numbers and option names; ambiguous product behaviour; and the word "done" without a real run. No secret goes into a prompt or the repo.
