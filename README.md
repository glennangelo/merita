# A memorial website

A small, calm website in memory of someone, with:

- their photograph, name and dates, under the words **In Loving Memory**
- the details and times of the **memorial ceremony** and the **reception** that follows
- a place for a **live stream link**, ready to be filled in when you have it
- a **guestbook**, where visitors can leave their name, a message and a photograph
- a choice for each visitor: **public** (shown on the site once the family approves it) or **private** (only the family ever sees it)
- a **family page** for reading private messages and approving public ones

It is set in Cormorant Garamond and Lora — an old-style face with the air of
an engraved memorial card, paired with one made for reading at length.

It is built to be quick on an old phone and easy to read for older visitors:
generously large text by default, strong contrast throughout, big buttons and
plain wording, and it works with a screen reader or keyboard alone. There is no
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

## Step 2 — Create the database for the guestbook

1. In the dashboard, open **Storage & Databases → D1 SQL Database**.
2. Click **Create database**.
3. Name it exactly `memorial-guestbook`, then click **Create**.
4. Open the new database and choose the **Console** tab.
5. Open the file `schema.sql` from this project, copy **all** of its text,
   paste it into the console box, and click **Execute**.

That builds the empty table the guestbook writes into.

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

The guestbook will work already, but nobody can sign in to moderate it yet.

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
| Their name | the `hero__name` heading |
| Dates of birth and death | the `hero__dates` paragraph — change both the visible date **and** the `datetime="YYYY-MM-DD"` next to it |
| A line of verse, scripture, or something they always said | the `epitaph` block — delete the whole block if you would rather not have one |
| Ceremony date, time, venue, address | the **Memorial Ceremony** card |
| Reception date, time, venue, address | the **Reception** card |
| Map links | the two `maplink` links — put the venue address after `query=`, with `+` instead of spaces |
| Parking, access, dress, flowers | the **Good to know** rows |
| Who to contact | the footer, at the very bottom |

### The photograph

Save the picture as `public/assets/portrait.jpg`, then in `public/index.html`
change `portrait.svg` to `portrait.jpg` on the `src` line. A photo of around
800 × 1000 pixels keeps the page fast. Please also update the `alt` text beside
it — that short sentence is what a blind visitor hears.

### The calendar file — `public/memorial.ics`

This is what the **Add to my calendar** button downloads. Change the dates,
times and addresses. The format is `YYYYMMDDThhmmss` in 24-hour time, so
11 o'clock in the morning on 1 January 2026 is `20260101T110000`.

### The other pages

`guestbook.html`, `sign.html` and `admin.html` each have their name in the
`<title>` line near the top. Change `[Full Name]` there too.

---

# Step 7 — The live stream link, when you have it

Open `public/index.html` and find the section marked **Watch online**. The
instructions are written in the file itself: delete the paragraph saying the
link is not available, remove the two `REMOVE THIS LINE` markers, and paste the
streaming address between the quotation marks in `href=""`.

Until you do, visitors see a friendly note asking them to check back — so the
page never looks broken or unfinished.

---

# How the guestbook works

**When someone leaves a message** at `/sign`, they choose whether it is
public or private. Their photograph is made smaller in their own browser before
it is sent, so it works on a poor signal.

**Private messages** go straight to the family page. They are never shown on
the website, whatever else happens.

**Public messages** wait for approval. Nothing a stranger writes appears on the
website until a family member has read it and approved it — so the guestbook
cannot be used to post something hurtful in a moment of grief.

**The family page** is at `/admin` — there is also a quiet link in the
footer of the home page. Sign in with your password and you will see three lists:

- **Waiting for approval** — read each one, then *Approve* it, keep it *private
  instead*, or *Delete* it.
- **Private to the family** — messages meant only for you.
- **Live in the guestbook** — everything currently on the public page. You can
  hide anything again at any time.

You stay signed in for 12 hours. Changing `ADMIN_PASSWORD` signs everyone out.

**Sharing the links.** Send people the main address, or the guestbook directly.
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

## If the guestbook fills up with spam

The form already has a hidden trap that catches ordinary bots, and a limit on
how many messages can arrive in a few minutes. If something still gets through,
it is only ever visible after you approve it — so the public page stays safe.
For a busy site you could add Cloudflare Turnstile (free), but you almost
certainly will not need to.

---

# Where things are

```
public/                 the website itself
  index.html            the main page — photo, name, dates, ceremony, reception, live stream
  guestbook.html        public messages
  sign.html             the form for leaving a message
  admin.html            the family's page
  memorial.ics          the "add to my calendar" file
  assets/               stylesheet, small scripts, portrait
  fonts/                the two typefaces, served from your own site
  _headers              security settings applied by Cloudflare

src/                    the guestbook's small server, one Cloudflare Worker
  index.js              decides which of the addresses below was asked for
  guestbook.js          reading approved messages, receiving new ones, photos
  admin.js              signing in, listing everything, moderating
  lib.js                sessions, tidying up what visitors typed

schema.sql              the database table
wrangler.toml           the settings Cloudflare reads on every deploy
```

## A note on the information people give you

Names, messages and photographs are stored in your own Cloudflare database and
nowhere else. Nothing is shared with any other company, and there is no
analytics or tracking of any kind. If someone asks for their message to be
removed, delete it from the family page — it is gone for good.
