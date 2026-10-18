# Weekend Goals Reporter

A private Chrome extension that files a GitHub issue, with a screenshot, for the page you are looking at. No build step and no dependencies.

## Load it

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and select this folder (`tools/report-extension`).

After editing a file, press the reload button on the extension's card.

## Create a token

GitHub, Settings, Developer settings, Fine-grained personal access tokens, Generate new token.

- Repository access: only the one repository the reports go to.
- Permissions: Contents read and write, Issues read and write, Metadata read.

## Fill in the options page

Open it from the link at the bottom of the popup, or from the extension's card, Details, Extension options.

| Field | Default | Meaning |
| --- | --- | --- |
| GitHub token | none | The fine-grained token above. Stored in `chrome.storage.local`, on this browser only. |
| Repository | `weekendgoals/weekendgoals` | `owner/name` that receives issues and screenshots. |
| Tickets branch | `tickets` | Branch the screenshots are committed to. |
| Label | `agent-ticket` | Label put on every issue. Create it in the repository first. |

Save, then Test token to check the token can read the repository.

## Use it

Click the toolbar button on any page, or select text and choose Report to Weekend Goals from the right-click menu. The first time, the popup captures the tab as screenshot 1. Fill in the title, type, priority, description and the selected text (prefilled, editable), then submit. The result is a link to the new issue.

The report in progress is a draft kept in `chrome.storage.local`, so it survives the popup closing when you click the page. Scroll, open the popup again and press Capture to add another screenshot; nothing is captured automatically when a draft is restored. The line above the form says when the draft started, and Discard throws it away and starts a new one from the current tab. Submitting clears the draft.

A ticket takes up to 10 screenshots, at least one. Add them three ways:

- Capture: the visible part of the current tab, as PNG.
- Add files: PNG, JPEG, WebP or GIF, up to 10 MB each.
- Paste: an image on the clipboard, anywhere in the popup.

Each thumbnail has a caption field and a remove button; click the thumbnail to open it full size.

Chrome's own pages (`chrome://`, the Web Store) refuse script injection, so on those the selected text and viewport are left empty.

## What gets filed

- If the tickets branch does not exist it is created as an orphan branch holding a `README.md`.
- Screenshots are committed one at a time to `tickets/<ticketId>/screenshot-<n>.<ext>` on that branch, `n` counting from 1 and `ext` one of `png`, `jpg`, `webp`, `gif`. The ticket id is `YYYYMMDD-HHMMSS-xxxx` in UTC.
- An issue is created with the label, listing page URL and title, type, priority, viewport, user agent, ticket id, description, selected text, and a numbered `## Screenshots` list linking each image, followed by its caption when it has one.
