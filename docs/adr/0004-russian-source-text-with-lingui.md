# The source text of the UI is Russian, and CI requires an English translation

We write the UI text in Russian directly in the code with Lingui macros, and English is a translation. CI fails if a developer did not extract the catalogs, or if one message has no English translation. Thus each feature comes with its English text at the same time. The core contains no text for people: it returns error codes, and the UI translates them.

## Considered Options

- **i18next, Paraglide, or use-intl.** Rejected: the code contains keys, not text, and we want to read the real Russian text in the code.
- **FormatJS.** Rejected: it keeps the text in the code, but a check for missing translations is not built in.
