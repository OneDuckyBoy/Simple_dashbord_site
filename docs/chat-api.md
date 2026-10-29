# Chat API: the assistant in your own chat

This is for a company's developers who build their own chat window, on their website or in
their app, with our assistant behind it. Your chat calls the same HTTP routes our web chat uses,
so it can do everything our web chat does: streamed replies, history, a new conversation,
photos and PDFs, voice notes, files in replies, Confirm and Cancel, thumbs up and down, and
Stop.

The only difference is how a request says who it is. Our web chat sends the login cookie. Your
server sends an **access key** and the **email of the employee** who is chatting.

## How it fits together

```
Employee's browser ──► your server (holds the key) ──► our API ──► the assistant
                   ◄── streamed reply, passed on ◄──
```

- The key stays on your server. Never put it in a browser, a mobile app or a public repository:
  whoever holds it can act in the assistant as any employee of your company, Confirm included.
- Your server decides who the person is from **your own** login, then names them to us. Never
  take the email from what the browser sends.
- Our API answers no cross-origin (CORS) requests, so a browser cannot call it directly anyway.

## 1. Get an access key

A company admin signs in to our web app, opens **API Keys**, and under **API access** clicks
**Create key**. The key (`ak_…`) is shown once: copy it into your server's secret store. We keep
only a fingerprint of it, so a lost key cannot be shown again; create a new one instead.

- **Revoke** stops a key at once: its next request is refused.
- **Rotate** without downtime: create a new key, deploy it, then revoke the old one.
- The list shows when each key was last used.

## 2. Send these headers on every request

| Header           | Value                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `x-api-key`      | The access key.                                                                                                                |
| `x-user-email`   | The email of the employee who is chatting. They need an account in our app, active, with access to the assistant.              |
| `x-provider-key` | Optional. The integration they work in (`roster`, `nula_bg`), as they would pick it in our app. Leave it out if they have one. |

The person is the employee with that email **in your company**, with exactly the roles and
access they have in our app. Change their role there and the next request follows it.

```bash
curl -N https://ai.example.com/api/chat/messages \
  -H 'x-api-key: ak_…' \
  -H 'x-user-email: anna@yourcompany.com' \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"text":"How many invoices did we get this month?"}'
```

## 3. The conversation

Each employee has one open conversation, the same one they see in our web app's chat. What
they ask in your chat shows there too, and the other way round. Nothing is pushed between the
two: read the history when your chat opens. A new conversation started in either one starts it
in both.

| Route                               | What it does                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/chat/messages`            | History (below)                                                                                 |
| `POST /api/chat/messages`           | Send `{ "text": "…" }`, at most 8000 characters. Answers with a stream (section 4)              |
| `POST /api/chat/upload`             | Send a file: multipart `file`, and `text` as its caption if there is one. Answers with a stream |
| `POST /api/chat/transcribe`         | A voice note: multipart `file` alone. Answers `{ "text": "…" }` for the person to edit and send |
| `GET /api/chat/turns/:id/events`    | Pick a reply's stream up again after a dropped connection (section 4)                           |
| `POST /api/chat/turns/:id/cancel`   | Stop (section 6)                                                                                |
| `POST /api/chat/turns/:id/approval` | Confirm or Cancel: `{ "decision": "confirm" }` or `"cancel"` (section 5)                        |
| `POST /api/chat/turns/:id/feedback` | Thumb: `{ "verdict": "up" }` or `"down"`, and `"reason"` if given, at most 500 characters       |
| `POST /api/chat/reset`              | New conversation. The old one is kept, out of sight                                             |
| `GET /api/chat/files/:messageId`    | A file the person sent (below)                                                                  |
| `GET /roster-files/:documentId`     | An invoice file a reply gave (below)                                                            |
| `GET /dashboard/pdf/:invoiceId`     | A NULA invoice's PDF, which a reply gives as a link (below)                                     |

**History** answers `{ "messages": [...], "hasMore": true }`, oldest first: `?limit=` (30 by
default, at most 100). For older messages, pass `?before=` with the id of the first message you
have. A message, in history and in the stream:

```json
{
  "id": 1207,
  "role": "assistant",
  "content": "You received **14 invoices** in October, 3 of them unpaid.",
  "createdAt": "2026-10-26T09:14:03.120Z",
  "attachment": null,
  "turnId": 812,
  "feedback": null
}
```

- `role` is `user`, `assistant` or `error`.
- An `assistant` row's `content` is GitHub-flavoured Markdown (lists, tables, bold, links) in
  which a single line break is a break, as our web chat shows it. Render it without raw HTML and
  allow only http(s) links. A link may point to our web app (a dashboard, say), which asks for a
  login there. `user` and `error` rows are plain text.
- An `error` row's `content` is usually an error code (section 4), on old rows `pending`;
  otherwise it is a sentence to show as it is.
- A saved reply can still hold a file mark like `[[invoice:41]]` when nobody read its stream to
  the end. Take any `[[…:…]]` mark out of the text. `[[invoice:41]]` (or `[[invoice-sent:41]]`)
  is the invoice file `/roster-files/41`.
- `turnId` is what Stop, Confirm, Cancel and the thumbs name. A reply given at once, without the
  assistant thinking (some short questions are), has none and takes no thumb.
- `feedback` is the person's own thumb: `up`, `down` or null.

**Files.** Fetch each from your server with the same headers, and pass our `Content-Type`,
`Content-Disposition`, `X-Content-Type-Options` and `Content-Security-Policy` headers on to the
browser with the bytes.

- `attachment` is `{ "filename", "mime", "stored": true }` on a file the person sent: it is
  `GET /api/chat/files/<message id>`. When they sent it with no caption, the message's `content`
  is the file name; our chat shows only the file then.
- `attachment` is `{ "filename", "mime", "documentId" }` on an invoice a reply gave: it is
  `GET /roster-files/<documentId>`.
- A NULA invoice's PDF comes as a link in the reply's text, `/dashboard/pdf/<invoice id>` on our
  app. Point the link at your own server and fetch it from there.
- An employee who works in more than one integration needs `x-provider-key: roster` for a roster
  invoice and `x-provider-key: nula_bg` for a NULA PDF.
- Uploads take what the company's integrations take: today a photo (JPEG, PNG or WebP) or a PDF,
  at most 10 MB. A voice note is WebM, Ogg, MP3, WAV, M4A or AAC, at most 10 MB.

## 4. Reading the stream

A send and an upload answer with `text/event-stream`. Each frame has an `event:` name and a
`data:` line of JSON; frames from the assistant's work also carry an `id:` line. A line starting
with `:` is a keep-alive ping, sent every 15 seconds: skip it. In order:

| Event    | `data`                                                                                                          | What to do                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `status` | `{ "phase": "thinking" }`                                                                                       | Show that it is working                                                                                        |
| `status` | `{ "phase": "thinking", "userMessage": {…}, "turnId": 812 }`                                                    | The person's message as saved, and the turn: keep `turnId` for Stop and for resuming                           |
| `status` | `{ "phase": "tool:roster_invoices_query", "name": "roster_invoices_query", "state": "running", "turnId": 812 }` | It is looking something up; `state` goes on to `done` or `failed`. **Clear the text streamed so far**          |
| `status` | `{ "phase": "restart", "turnId": 812 }`                                                                         | The answer is being written again. **Clear the text streamed so far**                                          |
| `delta`  | `{ "text": "You received " }`                                                                                   | Append to the reply being written                                                                              |
| `done`   | `{ "message": {…} }`                                                                                            | The reply as saved: show it **in place of** the streamed text                                                  |
| `error`  | `{ "code": "failed", "message": {…} }`                                                                          | It failed; `message`, when there is one, is the `error` row to show. Without it, show your text for the `code` |

A message an integration or a fixed answer replies to at once has no `turnId` and no deltas: a
`status` with its `userMessage`, then `done`.

**Error codes**: `unavailable` (the company has no working AI model key, which an admin fixes
under API Keys, or the assistant cannot take messages right now), `storage_unavailable` (files
cannot be stored right now), `rate_limited`, `failed`.

A second message sent while a reply is still being written waits for it and is answered after.
Our chat lets the person send nothing until the reply is done.

### Pass the stream through as it arrives

Your server must forward each chunk the moment it comes. A proxy or framework that buffers or
compresses the response shows the whole answer at the end instead of word by word: in nginx,
`proxy_buffering off;` and `gzip off;` on these routes. Because of the pings, an idle timeout
of a minute is enough; do not cap the total time of the response.

```js
// Express (Node 18+). The browser calls these routes on YOUR server.
import express from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const API = 'https://ai.example.com';
const app = express();

/** The person from YOUR session, never from what the browser sent. */
function asPerson(req) {
  return { 'x-api-key': process.env.AI_ACCESS_KEY, 'x-user-email': req.user.email };
}

/** Our answer, passed on as it arrives. */
async function relay(res, url, init) {
  const abort = new AbortController();
  // The browser left: stop reading. The assistant still finishes and saves its answer.
  res.on('close', () => abort.abort());
  try {
    const upstream = await fetch(url, { ...init, signal: abort.signal });
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    // We were unreachable, or the stream was cut (a deploy does that): end the browser's too.
    if (!res.headersSent) res.status(502).json({ message: 'The assistant is out of reach' });
    else res.destroy();
  }
}

app.post('/chat/messages', express.json(), (req, res) =>
  relay(res, `${API}/api/chat/messages`, {
    method: 'POST',
    headers: {
      ...asPerson(req),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ text: req.body.text }),
  }),
);

app.get('/chat/turns/:id/events', (req, res) => {
  const last = req.get('Last-Event-ID');
  relay(res, `${API}/api/chat/turns/${Number(req.params.id)}/events`, {
    headers: {
      ...asPerson(req),
      Accept: 'text/event-stream',
      ...(last ? { 'Last-Event-ID': last } : {}),
    },
  });
});
```

### Pick a dropped stream up again

If the connection drops after you have the `turnId`, the assistant keeps working and saves its
answer. Ask again with the last `id:` you received, or with none to have the whole stream again:

```bash
curl -N https://ai.example.com/api/chat/turns/812/events \
  -H 'x-api-key: ak_…' -H 'x-user-email: anna@yourcompany.com' \
  -H 'Accept: text/event-stream' -H 'Last-Event-ID: 1730000000000-3'
```

The frames after that id are sent again, then the stream goes on live. Wait a little longer
between tries (our web chat waits up to 8 seconds, at random, for about a minute). Stop trying
on a 4xx other than 408 or 429. Two minutes after a reply ended its stream is gone, and the
stream answers only `done` with the saved reply: read the history for whether it waits for
Confirm.

## 5. Confirm and Cancel

Some writes wait for the person to confirm them: loading, spending or paying back wallet money,
declining or deleting an invoice, and deleting a dashboard. The assistant answers with a recap
instead, and its `done` message carries `approvalTurnId`. Show **Confirm** and **Cancel** under
it. Other writes are made at once, such as confirming an invoice, which books its spend.

```bash
curl https://ai.example.com/api/chat/turns/812/approval \
  -H 'x-api-key: ak_…' -H 'x-user-email: anna@yourcompany.com' \
  -H 'Content-Type: application/json' -d '{"decision":"confirm"}'
```

The answer is `{ "userMessage": {…}, "message": {…} }`, both saved: show them like any other
messages. Typing "yes" or "no" works too. In history, only the newest recap still waiting
carries `approvalTurnId`; once anything follows it, the buttons go. A `410` means it no longer
waits (show its message and drop the buttons), a `409` that the assistant is still busy in this
conversation (try again in a moment).

## 6. Stop and a new conversation

**Stop**: close your stream first, then call `POST /api/chat/turns/<turnId>/cancel`. Nothing more
is written for that reply. A stream left open after a Stop ends with `error` `failed`.

**New conversation**: `POST /api/chat/reset`. History is empty from then on, in our app too.

## 7. Errors and limits

A request refused before it reaches the assistant answers JSON:
`{ "statusCode", "message", "requestId" }`. The message is written to be shown or logged as it
is; quote the `requestId` when you ask us about one.

| Status | When                                                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | An empty or too long message, an empty file, or a body or header we cannot read                                                                                  |
| 401    | Your server's setup: no key, a revoked or unknown key, no `x-user-email`, or a key on a route that takes none. Not the employee being signed out                 |
| 403    | The email is not an active employee of your company with access to the assistant; or, on a file route, their role may not see that file (check `x-provider-key`) |
| 404    | A turn or file that is not this person's                                                                                                                         |
| 409    | Confirm or Cancel while the assistant is still busy in this conversation                                                                                         |
| 410    | Confirm or Cancel on a recap that no longer waits                                                                                                                |
| 413    | A file or voice note over 10 MB                                                                                                                                  |
| 429    | A limit below                                                                                                                                                    |
| 503    | The assistant cannot take messages right now: try again in a minute                                                                                              |

A file of a type the company's integrations do not take is accepted at first and ends its stream
with `error` `failed`.

| Limit (defaults)                          | Counts                                                     |
| ----------------------------------------- | ---------------------------------------------------------- |
| 600 requests a minute per key             | Every request with that key                                |
| 30 a minute per employee                  | Messages, files, voice notes and Confirm/Cancel presses    |
| 200 a minute per company                  | Messages, files and voice notes of everyone in the company |
| 60 thumbs a minute per employee           | Thumbs up and down                                         |
| 8 open streams per employee               | Replies being streamed at once                             |
| The company's monthly assistant allowance | When it is used up, the reply says so                      |

A minute is the clock's minute, and a `429` carries no `Retry-After`: wait for the next one. The
per-employee limits and streams count the person's use of our own app as well.

On our side, every reply the assistant works on for a request with a key is recorded as coming
from the API, apart from the ones asked in our app.
