# PDF reader dependencies

The existing pinned reader versions are served from the site itself so opening
a local PDF does not depend on third-party CDN connections.

- PDF.js 3.11.174, Apache-2.0: `pdf.min.js` and `pdf.worker.min.js` copied from
  https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/.
  License copied from https://github.com/mozilla/pdf.js/blob/v3.11.174/LICENSE.
- StPageFlip 2.0.7, MIT: `page-flip.browser.js` and `LICENSE` copied from
  https://cdn.jsdelivr.net/npm/page-flip@2.0.7/.

Keep both PDF.js files on the same version and retain the bundled licenses.
