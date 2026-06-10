# Adding Content to the Website (Gallery, Videos, Learn, Poetry & Art)

Your site now has four content sections that fill themselves from your Supabase
database. **You add an item once in the dashboard and it appears on the live site —
no code, no redeploy.** This guide shows exactly how.

Project: Supabase **Tribe Test** (`njfzrnqwbnuhmopgpsud`). Live site:
**https://krewe-of-shamrock-encountive.vercel.app**

---

## 1. The big idea

Everything lives in one table: **`content_items`**. Each row is one piece of content,
and its **`type`** decides which page it shows on:

| `type` | Shows on page | Use for |
|--------|---------------|---------|
| `gallery_image` | Gallery | Photos of parades, events, people |
| `video` | Videos | Demonstration & educational videos |
| `lesson` | Learn | Educational articles about heritage/traditions |
| `poem` | Poetry & Art | Poems and written pieces |
| `art` | Poetry & Art (Artwork) | Original artwork images |

Pages read the database every time they load, so new published rows appear within
seconds of saving — you never need me to redeploy for new content.

---

## 2. How to add a content item (step by step)

1. Go to **https://supabase.com** → open the **Tribe Test** project.
2. Left sidebar → **Table Editor** → choose the **`content_items`** table.
3. Click **Insert → Insert row**.
4. Fill in the fields (see the field guide below for your content type).
5. Make sure **`is_published`** is checked (true), then **Save**.
6. Refresh the live page — your item is there.

To hide something without deleting it, uncheck **`is_published`**. To reorder items,
set **`sort_order`** (lower numbers show first).

---

## 3. Field guide by content type

Common fields: `title` (required), `category` (a free topic/tag, e.g. "Parade 2026"),
`sort_order` (display order), `is_published` (show/hide).

**Photo (`gallery_image`)**
- `media_kind` = `image`
- `media_url` = the image's web address (see hosting below)
- `subtitle` = optional caption

**Video (`video`)**
- `media_kind` = `youtube`, `vimeo`, or `video_file`
- `media_url` = the video link (YouTube/Vimeo URL) or the uploaded file's URL
- `category` groups videos into sections (e.g. "Demonstrations", "Education")

**Lesson (`lesson`)**
- `body` = the article text. Leave a blank line between paragraphs.
- `media_kind` = `image` + `media_url` to show a picture (optional)
- `author`, `subtitle`, `category` optional

**Poem (`poem`)**
- `body` = the poem. Line breaks are preserved exactly as you type them.
- `author` = the poet

**Artwork (`art`)**
- `media_kind` = `image`
- `media_url` = the artwork image URL
- `author` = the artist

---

## 4. Where to put images, videos, and audio (hosting)

Your simple rule of thumb:

| What | Where to host it | Why |
|------|------------------|-----|
| **Big videos** (demos, lessons) | **YouTube or Vimeo** — paste the link | Free, fast, unlimited; no storage cost. Best choice for most video. |
| **Photos & artwork images** | **Supabase Storage** (the `media` bucket) | You own them; get a permanent public link. |
| **Short clips / audio you own** | **Supabase Storage** (`media` bucket) | Streams from your project. Keep files reasonably small (a few MB – tens of MB). |
| **Tiny things** (logo, icons) | Bundled in the site | Rarely changes. |

### Uploading a file to Supabase Storage (to get a URL)
1. Supabase dashboard → **Storage** → open the **`media`** bucket (already created).
2. Click **Upload file**, choose your image/clip.
3. Click the uploaded file → **Copy URL** (the public URL).
4. Paste that URL into the `media_url` field of your `content_items` row.

### Using a YouTube/Vimeo video
1. Set `media_kind` to `youtube` (or `vimeo`).
2. Paste the normal video link into `media_url` (e.g.
   `https://www.youtube.com/watch?v=...`). The site builds the player automatically.

---

## 5. Music — a note before you add it

Music is very doable, with two cautions worth deciding up front:

- **Licensing:** only use music you own, that's royalty-free/Creative-Commons, or that
  you have permission to use. Popular songs are copyrighted and can get a site taken
  down. I can point you to royalty-free sources.
- **Autoplay:** browsers block autoplay with sound, and surprise audio is a poor
  experience. The standard pattern is a small **play button** the visitor chooses to
  start.

I haven't added a music player yet because I'd like to match it to how you want it
(background ambiance toggle vs. a dedicated "Music & Audio" section vs. a soundtrack on
the home page). Tell me your preference and I'll build it. Audio files would live in the
`media` bucket just like clips.

---

## 6. Copyright & credit (all content)

- Use only photos, art, video, and writing you **created** or have **permission/rights**
  to publish. Credit creators in the `author` field.
- For educational content, write in your own words or cite sources; don't paste
  copyrighted articles wholesale.

---

## 7. Sample data to replace

I added one **clearly-labeled "SAMPLE —"** item of each type so the pages render. As you
add real content, delete the samples (Table Editor → select the row → delete). The two
sample images use a placeholder service and the sample video is a generic clip — all
safe to remove.

---

## 8. You can still hand me files

Prefer to just drop files in the project folder and have me handle them? That works too
— add your images/clips/poems to the folder and tell me; I'll upload them to Storage and
create the `content_items` rows for you in a batch.

---

## 9. What's next

- **Music**: tell me the style (background toggle vs. dedicated section) and I'll build it.
- **Richer gallery**: lightbox/slideshow, albums per event.
- **Officer dashboard**: manage content with buttons instead of the Table Editor.
