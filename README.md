# A memorial website

A small, calm website in memory of someone, with:

- their photograph, name and dates, under the words **In Loving Memory**
- the details and times of the **memorial ceremony** and the **celebration of life** that follows
- a place for a **live stream link**, ready to be filled in when you have it
- a **reply form**, so you know who is coming, how many of them, and to which part of the day
- a page of **memories**, where visitors leave their name, a message and a photograph
- a choice for each visitor: **public** (shown on the site once the family approves it) or **private** (only the family ever sees it)
- a **family page** for reading private messages and approving public ones

It is set like a printed order of service: centred on the page, parted by small
engraved ornaments, with nothing boxed in. Cormorant Garamond for the name and
headings, Lora for anything read at length. It is light throughout — there is no
dark mode, by choice.

Every word on it is meant to be brief. The details of the day are the point;
everything else gets out of the way.

It is built to be quick on an old phone and easy to read for older visitors:
generously large text by default, strong contrast throughout (every colour on
the page clears the strictest accessibility standard), big buttons and plain
wording, and it works with a screen reader or keyboard alone. There is no
text-size button to hunt for, because the text is already large — and if a
visitor has set their own browser to use bigger type, this site follows that
rather than overriding it. There are no cookie banners, no trackers and no
adverts, and the typefaces are served from your own site, so nothing about a
visitor is shared with anyone.

## What it costs

**Nothing**, on Cloudflare's free plan — that covers far more visitors and
messages than a memorial site will ever see. The only optional cost is your own
web address (a domain name), roughly £8–£12 a year, and only if you want one.
A free `something.workers.dev` address works perfectly well.

---

# Setting it up

You do not need to be technical. Allow about half an hour. Please do the steps
in order — each one depends on the last.

Cloudflare renames things in its dashboard from time to time, so if a menu is
not quite where this says, look for the wording in **bold** rather than the
exact path.

## Step 1 — Get a Cloudflare account

Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and
create a free account. No payment card is needed.

## Step 2 — Create the database

1. In the dashboard, open **Storage & Databases → D1 SQL Database**.
2. Click **Create database**.
3. Name it exactly `memorial-guestbook`, then click **Create**.
4. Open the new database and choose the **Console** tab.
5. Open the file `schema.sql` from this project, copy **all** of its text,
   paste it into the console box, and click **Execute**.

You should see **3 commands executed successfully**. That builds the two tables
the site writes into:

- `entries` — the memories. `visibility` records whether the writer wanted it
  public or private, and `approved` turns to 1 once a family member has said a
  public one may appear. A private one is never shown publicly whatever that
  says.
- `rsvps` — the replies: a name, how many people, and which parts of the day.

The file has no comments in it on purpose. Cloudflare's console rejects a
paste that contains `--` comment lines, with a confusing complaint about the
request having no query, so the explanation lives here instead.

If the console will not take all three statements at once, run them one at a
time — paste the first `CREATE TABLE ... );`, Execute, then the `CREATE INDEX`,
then the second `CREATE TABLE`. The order does not matter.

If you ever come back to this step — after an update to the project, say — you
can paste it in and run it again. Every statement only creates what is missing,
so nothing already there is touched or lost.

## Step 3 — Tell the website where its database is

Still on the database page, find its **Database ID** — a long line of letters
and numbers — and copy it.

Now open `wrangler.toml` in this repository. You can edit it on GitHub: open
the file, click the pencil icon, change it, then click **Commit changes**.
Replace `PASTE-YOUR-DATABASE-ID-HERE` with the id you copied, keeping the
quotation marks:

```toml
database_id = "a1b2c3d4-....-your-real-id-here"
```

The id is only a label, not a password, so it is safe to save in the project.
If you skip this step the website will refuse to deploy, with an error saying
it cannot find the database.

## Step 4 — Put the website online

1. In the dashboard, open **Compute (Workers) → Workers & Pages**.
2. Click **Create**, then choose **Import a repository** (it may be worded
   **Connect to Git**), and give Cloudflare permission to read this repository.
3. Choose this repository and accept the settings it suggests. Cloudflare reads
   `wrangler.toml` for everything it needs, so there is nothing to fill in — if
   it asks for a build command, leave it empty.
4. Click **Deploy**, and wait for it to finish.

Your site is now live at an address ending in `.workers.dev`, and Cloudflare
will rebuild it automatically every time you change a file on GitHub.

If Cloudflare names the Worker after your repository rather than the `name` in
`wrangler.toml`, change that line to match what the dashboard shows. If the two
disagree, a later deploy can quietly create a second Worker and your address
stops updating.

The site will work already, but nobody can sign in to moderate it yet.

## Step 5 — Choose the family password

1. Open your new Worker and go to **Settings → Variables and Secrets**.
2. Click **Add**.
3. Set the type to **Secret**.
4. **Name:** `ADMIN_PASSWORD`
5. **Value:** a password the family agrees on. Use several words together, for
   example `garden-kettle-tuesday-hill` — long and memorable beats short and
   clever.
6. Save.

Cloudflare usually applies a new secret immediately. Visit
`your-site.workers.dev/admin` and sign in to check. If it still says no
password has been set, open the **Deployments** tab and redeploy the most
recent build, then try again.

---

# Step 6 — Fill in your own details

Every place that needs your words is marked with a **✏️ EDIT** comment and
written inside `[square brackets]`, so nothing real is ever mistaken for a
placeholder. You can edit files directly on GitHub — open a file, click the
pencil icon, make the change, and click **Commit changes**. The site rebuilds
itself within a minute or so.

### The main page — `public/index.html`

| What to change | Where to look |
|---|---|
| The page title and description | near the top, in the `<title>` and `description` lines |
| Their name | the `hero__name` heading — but see the note below, it appears in several places |
| Dates of birth and death | the `hero__dates` paragraph — change both the visible date **and** the `datetime="YYYY-MM-DD"` next to it |
| A line of verse, scripture, or something they always said | the `epitaph` block — delete the whole block if you would rather not have one |
| Ceremony venue, date, time, address | the first `event` block, headed **Memorial Ceremony** |
| Celebration venue, date, time, address | the second `event` block, headed **Celebration of Life** |
| Addresses | each address is itself the link to a map — change the visible address **and** the same address after `query=`, with `+` instead of spaces |
| The line describing each event | the `aside` line at the end of each one — delete it if there is nothing to say |
| Who to contact | the footer, at the very bottom |

### A first name, as well

The invitation on the home page uses their first name on its own — "tributes to
[First Name]". That is a separate placeholder from the one below, so search for
`[First Name]` too.

### Their name appears in more than one place

Fifteen, across five files: the headline on the home page, the line at the top
of every other page, each page's `<title>`, the description search engines
show, and the photograph's alt text.

The surest way is to search the whole project for `[Full Name]` and replace
every one — most editors do this in a single step. If you would rather not,
send the name to whoever set this up and it can be done in one go. Missing one
is easy, and a page still saying `[Full Name]` is a horrible thing to find
later.

The same is true of the dates, which appear as `[1 January 1234]` and
`[1 January 2026]` on the home page and as `[1234]`–`[2026]` in its
description.

### The photograph

Save the picture as `public/assets/portrait.jpg`, then in `public/index.html`
change `portrait.svg` to `portrait.jpg` on the `src` line. A photo of around
800 × 1000 pixels keeps the page fast. Please also update the `alt` text beside
it — that short sentence is what a blind visitor hears.

### The reply page — `public/rsvp.html`

The two tick-boxes repeat the time and venue of each part of the day. Change
those to match the home page, so nobody is told two different things.

### The other pages

`rsvp.html`, `memories.html`, `share.html` and `admin.html` each have their
name in the `<title>` line near the top. Change `[Full Name]` there too.

---

# Step 7 — The live stream link, when you have it

Open `public/index.html` and find the section marked **Watch online**. The
instructions are written in the file itself: delete the paragraph saying the
link is not available, remove the two `REMOVE THIS LINE` markers, and paste the
streaming address between the quotation marks in `href=""`.

Until you do, visitors see a friendly note asking them to check back — so the
page never looks broken or unfinished.

---

# How it works

**When someone replies** at `/rsvp`, they give their name, how many are coming,
and whether that is for the ceremony, the celebration of life, or both. Replies are never
shown publicly — they appear only on the family's page, under **Coming**, with
the totals worked out for you: how many people at the ceremony, how many at the
celebration. That is the number a caterer or a venue will ask you for.

**When someone shares a memory** at `/share`, it goes on the website unless they
tick "Keep this private". Their photograph can be any size — it is made smaller
in their own browser before it is sent, so it works on a poor signal, and only
about a megabyte is stored. Photographs carry no written description, so a
screen reader announces them as "a photograph shared by" whoever sent it.

**Private messages** go straight to the family page. They are never shown on
the website, whatever else happens.

**Public messages** wait for approval. Nothing a stranger writes appears on the
website until a family member has read it and approved it — so the page
cannot be used to post something hurtful in a moment of grief.

**The family page** is at `/admin`. There is deliberately no link to it
anywhere on the site, so you reach it by typing the address — add
`/admin` to the end of your web address and save it as a bookmark. Sign in with
your password and you will see four lists:

- **Waiting for approval** — read each one, then *Approve* it, keep it *private
  instead*, or *Delete* it.
- **Private to the family** — messages meant only for you.
- **Shared** — everything currently on the public page. You can hide anything
  again at any time.
- **Coming** — the replies, newest first, with the totals along the top.

You stay signed in for 12 hours. Changing `ADMIN_PASSWORD` signs everyone out.

**Sharing the links.** Send people the main address, or `/rsvp` and `/memories`
directly. There is no menu bar: the home page carries buttons to everything,
and every other page opens with their name, which leads back to it.
Keep `/admin` and the password within the family. The admin page is hidden
from search engines, but it is the password that protects it — so choose a good
one and do not put it in a group chat with strangers in it.

---

# Optional extras

## Your own web address

In your Worker, open **Settings → Domains & Routes** and add a custom domain. You
can buy the domain through Cloudflare at cost price. A memorial address such as
`remembering-firstname.com` is a kind thing to be able to say aloud.

## Previewing changes on your own computer

Only if you would like to. You need [Node.js](https://nodejs.org) installed.

```bash
npm install                      # once
npm run db:setup                 # once — creates the table on your own machine
cp .dev.vars.example .dev.vars   # once — then set a password inside it
npm start                        # opens the site on your own machine
```

Nothing you do locally touches the live site.

## If spam starts arriving

The form already has a hidden trap that catches ordinary bots, and a limit on
how many messages can arrive in a few minutes. If something still gets through,
it is only ever visible after you approve it — so the public page stays safe.
For a busy site you could add Cloudflare Turnstile (free), but you almost
certainly will not need to.

---

# Where things are

```
public/                 the website itself
  index.html            the main page — photo, name, dates, ceremony, celebration, live stream
  rsvp.html             the reply form
  memories.html         the memories people have shared
  share.html            the form for sharing one
  admin.html            the family's page
  assets/               stylesheet, small scripts, portrait
  fonts/                the two typefaces, served from your own site
  _headers              security settings applied by Cloudflare

src/                    the site's small server, one Cloudflare Worker
  index.js              decides which of the addresses below was asked for
  memories.js           reading approved memories, receiving new ones, photos
  rsvp.js               receiving replies, and totting them up for the family
  admin.js              signing in, listing everything, moderating
  lib.js                sessions, tidying up what visitors typed

schema.sql              the database tables
wrangler.toml           the settings Cloudflare reads on every deploy
```

## A note on the information people give you

Names, messages and photographs are stored in your own Cloudflare database and
nowhere else. Nothing is shared with any other company, and there is no
analytics or tracking of any kind. If someone asks for their message to be
removed, delete it from the family page — it is gone for good.
