# Flow Reporter

A private Chrome extension that files a finding for the page you are looking at: a GitHub issue labelled `flow:found`, with screenshots, that Flow turns into a ticket once a person approves it. No build step and no dependencies.

## Load it

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose Load unpacked and select this folder (`tools/reporter`).

After editing a file, press the reload button on the extension's card.

## Create a token

GitHub, Settings, Developer settings, Fine-grained personal access tokens, Generate new token.

- Repository access: only the repositories the findings go to. One token serves every target on the options page, so give it each target's repository.
- Permissions:
  - Contents read and write, to commit the screenshots to the findings branch.
  - Issues read and write, to file the finding and put it under its epic.
  - Metadata read, which GitHub adds on its own.

## Fill in the options page

Open it from the link at the bottom of the popup, or from the extension's card, Details, Extension options.

| Field | Default | Meaning |
| --- | --- | --- |
| GitHub token | none | The fine-grained token above, one for every target. Stored in `chrome.storage.local`, on this browser only. |
| Issue label | `flow:found` | Label put on every finding, whichever target it goes to. `flow init` creates it; until the project runs Flow 3.1, create it by hand. |

Then one or more **targets**, each a place a finding can go. Add target adds one, Remove target removes it; you need at least one to file, and no two may share a name.

| Field | Default | Meaning |
| --- | --- | --- |
| Name | the repository | What the popup's File to list shows, such as "Site" or "Docs". |
| Repository | none | `owner/name` that receives the finding and its screenshots. |
| Epic | none | The epic the finding is filed under, usually the open Bugs epic. An issue number; leave it empty to file the finding with no epic. |
| Screenshots branch | `flow-findings` | Branch the screenshots are committed to. Flow's own `flow create-finding` uses the same branch. |

Save, then Test token to check the token can read every target's repository.

Settings saved before targets existed (one repository, epic and branch) become one target named after the repository the first time the extension loads them.

## Use it

Click the toolbar button on any page, or select text and choose Report a finding from the right-click menu. The first time, the popup captures the tab as screenshot 1. Choose where the finding goes in File to, above the title: the popup remembers the target you last filed to on each site (by origin, such as `https://staging.example.com`) and picks it next time, or the first target on a site where you have filed nothing; choosing a target without filing remembers nothing. Then write what happened and submit; that is the whole form.

- What happened is required, because Flow tells a finding filed twice apart by its first words; with it empty the popup says "Say what happened." and files nothing.
- The title is optional. Left empty, the issue is titled by the first line of what happened, cut at a word before 80 characters with `…`, so a list of findings still reads as sentences; with nothing written at all, by the page's title.
- Text selected when you choose Report a finding from the right-click menu is quoted (`> ` before each line) at the start of what happened in a new draft, or added after a blank line to the draft in progress. A plain toolbar click reads no selection, so nothing lands in the description you did not choose.

The result line links the new finding, names the repository it went to and says whether it was filed under the epic.

The finding in progress is a draft kept in `chrome.storage.local`, so it survives the popup closing when you click the page, its target included. If that target has since been removed from the options, the popup says so and selects another; the draft keeps its old target until you file or choose one. Scroll, open the popup again and press Capture to add another screenshot; nothing is captured automatically when a draft is restored. The line above the form says when the draft started, and Discard throws it away and starts a new one from the current tab. Submitting clears the draft.

A finding takes up to 10 screenshots, at least one. Add them three ways:

- Capture: the visible part of the current tab, as PNG.
- Add files: PNG, JPEG, WebP or GIF, up to 10 MB each.
- Paste: an image on the clipboard, anywhere in the popup.

Each thumbnail has a caption field and a remove button; click the thumbnail to open it full size.

Chrome's own pages (`chrome://`, the Web Store) refuse script injection, so on those the viewport is filed as unknown.

## What gets filed

- If the findings branch does not exist it is created as an orphan branch holding only a `README.md`: "Screenshots for findings filed from the reporter extension and by Flow; never merged."
- Screenshots are committed one at a time to `findings/<id>/screenshot-<n>.<ext>` on that branch, `n` counting from 1 and `ext` one of `png`, `jpg`, `webp`, `gif`. The finding id is `YYYYMMDD-HHMMSS-xxxx` in UTC.
- An issue is created with the label. Its first line is `<!-- flow:finding fingerprint=<page URL path>|<first 60 characters of what happened, lowercased, spaces collapsed> -->` (a `--` in it becomes `-`, so the comment cannot end early), which Flow reads to spot the same finding filed twice; the extension itself does not check it. Then come `## What happened`, `## Where` (page URL and title, viewport and user agent, then the finding id on a line of its own) and `## Screenshots`: a numbered list linking each image by the commit that added it, so the link keeps working when the branch moves, followed by its caption when it has one. Each link ends in `?raw=true`, so it opens the image itself, the way Flow's own `screenshots` command writes them.
- Everything goes to the chosen target: its repository, its screenshots branch and its epic.
- When the target's Epic is set, the issue is made a sub-issue of that epic. If that fails (no such issue, or the token lacks Issues write), the result line says why and the finding stays filed with no epic; add it under the epic by hand.

## How a finding becomes work

1. File it with the extension: an issue labelled `flow:found`, under the chosen target's epic.
2. A person reads it and approves it by adding the `flow:approved` label, or closes it to reject it.
3. `/flow:triage` turns each approved finding into a ticket with scope and acceptance criteria, after you say go.
4. `/flow:ticket`, `/flow:run` or the Flow Action builds the ticket like any other.
5. A person merges the pull request.
