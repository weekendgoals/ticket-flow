# Flow Reporter

A private Chrome extension that files a finding for the page you are looking at: a GitHub issue labelled `flow:found`, with screenshots, that Flow turns into a ticket once a person approves it. No build step and no dependencies.

## Load it

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and select this folder (`tools/reporter`).

After editing a file, press the reload button on the extension's card.

## Create a token

GitHub, Settings, Developer settings, Fine-grained personal access tokens, Generate new token.

- Repository access: only the one repository the findings go to.
- Permissions:
  - Contents read and write, to commit the screenshots to the findings branch.
  - Issues read and write, to file the finding and put it under its epic.
  - Metadata read, which GitHub adds on its own.

## Fill in the options page

Open it from the link at the bottom of the popup, or from the extension's card, Details, Extension options.

| Field | Default | Meaning |
| --- | --- | --- |
| GitHub token | none | The fine-grained token above. Stored in `chrome.storage.local`, on this browser only. |
| Repository | none | `owner/name` that receives findings and screenshots. |
| Findings branch | `flow-findings` | Branch the screenshots are committed to. Flow's own `flow create-finding` uses the same branch. |
| Issue label | `flow:found` | Label put on every finding. `flow init` creates it; until the project runs Flow 3.1, create it by hand. |
| Epic | none | The epic the finding is filed under, usually the open Bugs epic. An issue number; leave it empty to file the finding with no epic. |

Save, then Test token to check the token can read the repository.

## Use it

Click the toolbar button on any page, or select text and choose Report a finding from the right-click menu. The first time, the popup captures the tab as screenshot 1. Fill in the title, type, priority, what happened, the steps, what should have happened (optional) and the selected text (prefilled, editable), then submit. The result line links the new finding and says whether it was filed under the epic.

The finding in progress is a draft kept in `chrome.storage.local`, so it survives the popup closing when you click the page. Scroll, open the popup again and press Capture to add another screenshot; nothing is captured automatically when a draft is restored. The line above the form says when the draft started, and Discard throws it away and starts a new one from the current tab. Submitting clears the draft.

A finding takes up to 10 screenshots, at least one. Add them three ways:

- Capture: the visible part of the current tab, as PNG.
- Add files: PNG, JPEG, WebP or GIF, up to 10 MB each.
- Paste: an image on the clipboard, anywhere in the popup.

Each thumbnail has a caption field and a remove button; click the thumbnail to open it full size.

Chrome's own pages (`chrome://`, the Web Store) refuse script injection, so on those the selected text and viewport are left empty.

## What gets filed

- If the findings branch does not exist it is created as an orphan branch holding only a `README.md`: "Screenshots for findings filed from the reporter extension and by Flow; never merged."
- Screenshots are committed one at a time to `findings/<id>/screenshot-<n>.<ext>` on that branch, `n` counting from 1 and `ext` one of `png`, `jpg`, `webp`, `gif`. The finding id is `YYYYMMDD-HHMMSS-xxxx` in UTC.
- An issue is created with the label. Its first line is `<!-- flow:finding fingerprint=<page URL path>|<first 60 characters of what happened, lowercased, spaces collapsed> -->` (a `--` in it becomes `-`, so the comment cannot end early), which Flow reads to spot the same finding filed twice; the extension itself does not check it. Then come `## What happened`, `## Where` (page URL and title, viewport, user agent, then type, priority and finding id), `## Steps`, `## Expected`, `## Selected text` when there is any, and `## Screenshots`: a numbered list linking each image by the commit that added it, so the link keeps working when the branch moves, followed by its caption when it has one.
- When Epic is set, the issue is made a sub-issue of that epic. If that fails (no such issue, or the token lacks Issues write), the result line says why and the finding stays filed with no epic; add it under the epic by hand.

## How a finding becomes work

1. File it with the extension: an issue labelled `flow:found`, under the epic you set.
2. A person reads it and approves it by adding the `flow:approved` label, or closes it to reject it.
3. `/flow:triage` turns each approved finding into a ticket with scope and acceptance criteria, after you say go.
4. `/flow:ticket`, `/flow:run` or the Flow Action builds the ticket like any other.
5. A person merges the pull request.
