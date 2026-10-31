# Culture Crew: app structure

This document uses the rules of ASD-STE100 Simplified Technical English. No STE checker has verified it.

## Diagrams

The overview shows the parts and how they connect.

![Overview: the browser, the site, the API server, the AWS services, the venue websites and Claude Haiku](docs/architecture/1-overview.svg)

This diagram shows what runs on the API server and the tables in the database.

![Inside the API server: Caddy, the api container and its routes, the three jobs, and the database tables](docs/architecture/2-api-server.svg)

This diagram shows how a change goes from a pull request to production.

![How a change ships: pull request, checks, merge, then the site and API deploys](docs/architecture/3-deploy.svg)

## 1. General

The Culture Crew app shows a list of cultural events in Chicago.
The app has two main parts: the site and the API.
The site shows the data. The API keeps the data.
Each part has its own repository on GitHub.

| Part | Repository | Function |
|---|---|---|
| Site | `cc-site` | Shows events to the user. Sends the user's actions to the API. |
| API | `cc-backend` | Keeps the events, users, plans and venues. Finds new events. Sends emails. |
| Infrastructure | `cc-backend/infra/aws` | Defines the AWS resources. |

## 2. The site

The site has these files:
- `public/index.html`: the HTML.
- `public/css/site.css`: the styles.
- `public/js/`: the scripts, one file for each area of the site. `water.js` draws the water patterns (see "The look" below).
- `public/img/`: the link-preview image. The dolphins are SVG symbols in `index.html`, not image files (CC-139).
- `scripts/`: the checks and tests that GitHub Actions runs (section 9), and the script that stamps the asset links.

The page loads the scripts in a fixed order. All the scripts share one global scope.
The site does not have a build step. At deploy, a script adds a content hash to each link to a style or script file.
Thus, browsers can keep these files for one year and still get each new version.
The fonts come from Google Fonts. The page links them in `index.html`.

Amazon S3 keeps the files.
Amazon CloudFront sends the files to the user's browser. Some paths come from the API instead: `/e/*` (CC-108: a plain HTML page per event, for search engines and link previews), `/chicago/*` (CC-109: roundup pages such as this weekend, free and $25 and under, closing soon, each kind and each side of town, linked from the footer), `/sitemap.xml` and `/robots.txt`. CloudFront caches them for up to 10 minutes. Inside the site, a listing row (CC-140) opens the event view at `#e/<id>` (CC-117), set as a poster (CC-142): the category field with its water, then the facts, Tickets, Interested and Going beside your crews'. Its Share button gives the `/e/` page, whose main button opens the view. Both show public takes (CC-112): Cultural Journal entries their members chose to share from #planner ("Share publicly" saves at once), which admins can hide from the event view. #planner is My week (CC-146): the week ahead a day at a time with your plans as event rows, Still deciding beside it, and the Cultural Journal below, with only the entry being written open. `scripts/test_week.js` checks it in CI.
The join page, `chiculturecrew.com/join` (CC-121), is a copy of `index.html` with its own title and link-preview tags. The deploy makes the copy and puts it in S3 as the object `join`. The page then opens the join view: a sign-up box, with the catalog below it. Locally, nginx serves `index.html` at `/join` (`web.nginx.conf` in cc-backend).
The invite page, `chiculturecrew.com/invite` (CC-126), is the same join view with the admins' invite text. The deploy puts a copy of `index.html` with the invite page's preview tags in S3 as the object `invite`. An admin's "Invite a friend" opens this page. The visits and sign-ups count with the join page, with the source `invite` and the medium `link` or `qr`. Since CC-147 both pages, the Invite a friend dialog and its QR screen are Lakefront; the QR screen stays paper-white in both themes, and `scripts/test_invite.js` checks them in CI.

Your account (`#account`) and the pages the email links open (`#verify=`, `#reset=`; `start.js` routes them) are Lakefront since CC-148: Sign in beside "New here? Make an account", and, signed in, your profile and password beside the events you've sent us, your reports and photo approvals, with statuses as words. `scripts/test_account.js` checks their labels, autocomplete, statuses and errors in CI.
The browser runs the JavaScript.
The JavaScript gets the data from the API.

The site has these views:
- Home: a front page (CC-143). It has the full masthead, then three columns: the lead pick, three ways in, and Last chance (sorted by closing date). "The listings" follow as rows. On a phone, the columns stack.
- Join page (`/join`), and the invite page (`/invite`)
- Catalog
- Find an outing
- Submit an event: paste the event's link and the API fills in the form from the page (CC-124), or enter it by hand
- Your account
- Review (admins only): the queue, with an index of the other admin pages above it (CC-149)
- Venues, with each venue's hours (admins only)
- Site stats (admins only)
- Event sources (admins only)
- Found events (admins only)
- Issues (admins only)
- Members and Photo approvals (admins; approvers see Photo approvals too)
- QR card (admins only)

Each view has its own address (CC-157): Home is the bare site, and the others are a hash, such as `#catalog`, `#account`, `#planner`, `#review` or `#stats`. An event is `#e/<id>`. Showing a view pushes its address onto the history (`syncAddress` in `util.js`). Back and Forward fire `popstate`, and `route()` in `start.js` opens the view in the address. A reload opens the view in the address, and so do links in emails. When an address redirects (an admin page for someone who isn't an admin opens Your account), the redirect replaces the history entry, so Back still works. `scripts/test_routing.js` checks this in CI.

The site has two themes: light, which is the default, and dark, called "Lights down".
The user can change the theme with the Lights down button. Each device remembers the choice.

### The look (Lakefront)

The design brief is "Lakefront" (epic CC-135). The brief is not in this repository.
- **Tokens and type (CC-136):** the colours, the type and the corners are tokens at the top of `public/css/site.css`, one block for each theme. Newsreader is the reading type. Big Shoulders Text is the signage type. Corners are square. Only people get circles.
- **Masthead (CC-137):** the Chicago flag on the lake. Home and the join page show the full masthead: the date, the wordmark between two stripes, and the tagline. The other views show a compact masthead. On a phone, the nav is a sheet.
- **Water (CC-138):** each event has its own pattern of water, because events do not have photos. `water.js` draws the pattern on a canvas from the event's id. Thus, the same event always gets the same water. The pattern shows on the listing rows, the event poster, the home lead pick and the masthead.
- **Dolphins (CC-139):** one SVG drawing in `index.html`, in three looks: the host's pick (the dolphin through a gold ring, with a gold star), Interested (the lake dolphin) and Going (the ink dolphin).
- **Filters (CC-141):** the catalog filters sit between two rules, with no box. Each tap target is 44 pixels or more.
- **The rest of the site (CC-149):** Find an outing, Submit an event, the admin pages, their dialogs and the 404 page. Each page opens with a Newsreader title and an italic deck, with no eyebrow; each admin page leads back with "← Review". Lists are rows between hairlines, statuses are words, and errors start "Check this:" on the pale red band. Find an outing shows each stop and swap with its tile. The shared rules are the CC-149 block in `site.css`, scoped to `.lf-page` and `.editor`, and `scripts/test_rest.js` checks them in CI. The API's plain HTML pages (`/e/`, `/chicago/`) still have the old look.
- **Motion (CC-144):** a listing tile grows into the event poster (a view transition). Turning Going on makes a dolphin leap. Turning Interested on makes the dolphin nod. The water on the masthead and on the poster drifts slowly, at 30 frames a second or less, and only while it is on the screen. If the device asks for reduced motion, nothing moves: `motionOK()` in `water.js` is the one test for this.

## 3. The API

The API uses Python and FastAPI.
The API runs in a Docker container on one Amazon EC2 server.
Caddy receives each request first. Caddy then sends the request to the API.
Caddy also gives the HTTPS certificate.

The API has these groups of routes:

| Routes | Function | Who can use them |
|---|---|---|
| `/auth` | Sign in, sign out, register, confirm email, reset password | All users |
| `/events` | Show, search, submit, edit and delete events | All users can read. Admins can edit and delete. |
| `/me` | "I've been" marks and their photos, plans, the user's submissions, which crews can see each plan | The signed-in user only |
| `/photos` | Show one "I've been" photo | Anyone with a signed link (15 minutes) |
| `/approvals` | The photos waiting for approval; approve or reject one | Approvers and admins |
| `/admin/members` | Offer or remove the approver permission | Admins only |
| `/admin` | Review queue, scheduled events, withdrawn events, auto-reject rules and what they caught, site stats | Admins only |
| `/admin/discovery` | Event sources, found events, skip rules, the CSV download, the monthly budget | Admins only |
| `/venues` | Show, rename, merge and delete venues. Set opening hours and show times. | All users can read. Admins can change. |
| `/crews` | Start a crew, make invite links, invite by email, accept or decline an invite, join, leave. The owner renames, removes members, hands over or deletes. | Signed-in users. Only a crew's members can see it. |
| `/issues` | Report a problem with the site. Admins see the reports at `/admin/issues`, set a status and add a note. | Signed-in users report. Admins review. |
| `/e/{id}-{title}`, `/sitemap.xml`, `/robots.txt` | Plain HTML event pages with schema.org Event data, the sitemap of live events, and robots.txt (CC-108). Public details only. | Anyone, through chiculturecrew.com |
| `/chicago/`, `/chicago/{slug}` | Plain HTML roundup pages (CC-109), each with an intro admins edit on the Review page (`/admin/roundups`). | Anyone, through chiculturecrew.com. Intros: admins only |
| `/traffic` | Count a page view, a click to an event's page, or a planned outing, and where the visit came from (a tagged link or the referring site's domain). No cookies. | All visitors (the site sends it) |

## 4. The database

The database is PostgreSQL 16 on Amazon RDS.
Only the API can connect to the database.
Alembic controls changes to the database structure.
Each change is a numbered migration in `cc-backend/alembic/versions`.
The deploy applies new migrations automatically.

The database has these main tables:
- `users`: the accounts, with each account's role (user or admin) and the approver permission. `refresh_tokens` and `email_tokens` keep the sign-ins and the email links.
- `events`: the events. Each event also keeps its schedule: the dates and times that discovery found, and its usual show times.
- `venues`: the places where the events occur. Each venue keeps its opening hours, its usual show times and its standard cost. If an event does not post a price, the catalog shows the venue's standard cost ("Usually free"), and the price filters and the price sort use it. An event's own price always comes first. The standard cost is not copied into the events.
- `attended`: the "I've been" marks.
- `went_photos` and `photo_checks`: the photos that members add to "I've been" marks, and each Amazon Rekognition check (for the daily limit and the monthly cost).
- `plans`: the "interested" and "going" plans.
- `crews`, `crew_members` and `crew_invites`: the culture crews. An invite keeps only a hash of its link.
- `crew_email_invites`: invites to a crew by email address. The person with that address sees the invite when they sign in. The inviter does not learn if the address has an account.
- `plan_shares`: which crews can see a plan. A plan is private until its owner shares it. Only the members of those crews see it.
- `attended_shares`: which crews see an "I've been" mark: the crews that the plan was shared with when its owner marked it. The crew's plans show who has been and how many added an approved photo ("Three others have been, 1 with a photo."). A closed event stays on the crew's plans for 2 weeks while someone has been. On the crews page (CC-120) each crew is a summary that opens, one at a time, into its plans and members; invites, Rename, Leave and Dissolve sit under Manage crew. Since CC-145 the plans are event rows that open the event view (`#e/<id>`), and `scripts/test_crews.js` checks the page in CI.
- `discovery_sources`, `discovered_items`, `discovery_checks` and `discovery_skip_rules`: event discovery (section 5).
- `traffic_counts`, `traffic_visitors`, `traffic_visitor_days`, `traffic_source_visits`, `traffic_source_counts`, `traffic_join_visits`, `traffic_join_signups` and `user_active_days`: the counts for Site stats. The join tables (CC-121) keep the join page's visits and sign-ups by source. A sign-up counts for the join page when the visit came by `/join`. The count is not connected to the account. These tables do not keep names or IP addresses, and a referring site is kept as its domain only.
- `issue_reports`: problems that members reported, with a status and an optional note for the member.
- `app_settings`: settings that an admin can change, for example the discovery budget and the roundup intros (CC-109).
- `sheet_syncs`: the history of the old Google Sheet sync. Nothing writes to this table now.

## 5. Event discovery

Event discovery finds new events on the venues' own websites.
EventBridge Scheduler starts discovery one time each hour, from 7 AM to 10 PM Chicago time. Discovery runs in the api container.
Each source has a date for its next check. Discovery reads only the sources that are due. Most hours, no source is due.
Discovery reads a page again only when the page changed.

Discovery reads each changed page in this sequence:
1. If the page has complete schema.org event data (dates and a price), discovery uses that data. This costs nothing.
2. If not, Claude Haiku (on the Anthropic API) reads the page and lists the events. The Art Institute has its own API, so discovery uses that API.

Discovery puts each event that it finds in a holding list. Discovery does not put events on the site.
An admin approves or rejects each event on the "Found events" page.
About 60 and 45 days before an event opens, discovery reads the event's own page for the prices and the showtimes.

**Missing dates and show days:** an event must have a date before an admin can approve it. A performance (Theater or Music) must also have start times: its show days with times, dated performances with times, or the venue's usual show times. An open run with show days, such as a weekly open mic, does not need a date. If a found event does not have these, Found events marks it "Needs a date" or "Needs show days". Discovery then reads the event's own page on the next day, and then each week for 4 weeks. The event stays marked until an admin adds what is missing in the approve form, or rejects it. The weekly recap shows how many events are marked.

**Show days:** a performance has the days of the week that it is on, and one or more start times for each day. A day can be on some weeks of the month only: the 1st, 2nd, 3rd, 4th or last (for example, the 1st and 3rd Thursday). Find an outing suggests only those weeks. The opening and closing dates do not change. Admins set the show days in the event forms. Members can give them in "Submit an event" (optional). Claude reads them from pages such as "Thursdays to Saturdays at 8 PM". The event view shows them under Shows (CC-129 took them off the catalog cards).
Discovery also fills in the venues' opening hours and usual show times. Discovery does not change hours that an admin set.

> **NOTE:** The Anthropic API key is in AWS SSM Parameter Store. The scheduled job gives the key to discovery on standard input. The key is not in the code, on a command line or in a file.

**Monthly budget:** discovery costs about $5 each month. The default budget is $10. At 80% of the budget, the event pages wait until the next month. At 100%, discovery reads only the sources that an admin asks for with "Check now".

**Check by hand only:** some sites do not let discovery read them. An admin can set such a site to "Check by hand only". Discovery then does not try the site. The weekly recap shows the site in its "Check these by hand" list.

> **NOTE:** Until October 2026, a Google Sheet was the second source of events. The site does not read the sheet now. The sheet is a read-only archive. The old sheet events are ordinary events, and you can edit them on the site.

## 6. Photos with "I've been"

A member can add a photo to an "I've been" mark. The photo is optional. Each mark has one photo; a new photo replaces the old one.

The photo goes through these steps:
1. The browser shrinks the photo (longest side 1600 pixels) and draws it again as a JPEG. This removes the location and camera details.
2. The API sends the photo to Amazon Rekognition content moderation ($0.001 for each photo). If Rekognition is 90% sure that the photo is explicit, graphically violent or hateful, the API refuses the photo. A refused photo is never stored.
3. The API stores the photo in a private S3 bucket (encrypted, no public access). If Rekognition found other content, the photo is blurred for approvers.
4. The photo waits for an approver.

**Approvers:** a member can hold the approver permission. Only an admin can offer it (on the Members page), and the member accepts or declines it under "Waiting for you". Admins can always approve. An approver sees Photo approvals: the waiting photos, oldest first, with the event, the member's first name and last initial, and what Rekognition found. Blurred photos stay blurred until the approver chooses to look. The approver approves the photo, or rejects it with an optional reason that the member sees. A rejected photo is deleted from storage. Nobody approves their own photo. The weekly recap shows how many photos are waiting.

Only the member and the approvers can see a photo. Crew-mates see only that the member has been, and whether the photo is approved (📸) or not (📷); they do not see the photo. The API shows a photo only through a link that it signs for 15 minutes. A member can send 10 photos each day. When a member removes the mark, or an admin deletes the event, the photo is deleted. Each hour, the discovery job also deletes stored photos that the database does not know (for example, from a deleted account). Site stats shows the number of checks this month and their cost.

## 7. Find an outing

Find an outing suggests only events that occur at the time that the user selects: Today, Tonight, This weekend, Next weekend or a date.
- A performance must have a schedule: its own dates and times, its usual show times, or its venue's show times. If a performance does not have a schedule, Find an outing does not suggest it. The catalog shows it.
- An exhibition must be open: the venue's opening hours tell when. If the hours are not known, Find an outing uses 10 AM to 5 PM. For "Tonight", the venue must be open after 6 PM.

The site gets each event's schedule and its venue's hours from the API. Find an outing does the calculation in the browser.

## 8. Email

The API sends email with Amazon SES in the us-east-1 region.
The API sends four types of email:
- Email confirmation.
- Password reset.
- Crew invites sent to an email address. Each address gets one email per crew while the invite waits, and at most three a day.
- The weekly discovery recap to info@chiculturecrew.com. EventBridge Scheduler starts it on Tuesdays at 10 AM. The recap is an HTML email with a plain-text copy. If the API cannot send it, an alert goes to the product owner.
The API uses short-lived credentials. These credentials can only send email.

SES has production access, so it can send to any address.
Members must confirm their email address before they can send in events or see crew invites sent by email.

## 9. Deployment

GitHub Actions tests each pull request.
For the site, the "Page checks" job does these checks:
- The pages parse, and each element that the scripts use is in the page.
- Each colour pair meets WCAG AA in both themes (`scripts/check_contrast.py`, CC-136). The check reads the tokens from `site.css`. If you change a token, the check examines the new value.
- The Node tests in `scripts/`: the water, the listing rows, the event poster, the home page and the motion.
- The asset links can be stamped, and each script has correct JavaScript syntax.

When you merge a pull request into `main`, GitHub Actions deploys the change.
The site deploy uploads the files to S3, then removes each file that the site does not have now (CC-150). It does not remove style or script files that a cached page still links to, because their names do not change.
GitHub Actions uses OIDC to get access to AWS. It does not keep AWS keys.

Terraform defines the AWS resources: S3 (the site and the photos), CloudFront, EC2, ECR, RDS, SES, Rekognition permissions, Route 53, IAM, EventBridge Scheduler, SSM Parameter Store and CloudWatch.
CloudWatch keeps the logs. If a scheduled job or a deploy fails, CloudWatch sends an alert by email.

> **WARNING:** Only the product owner applies Terraform changes. Do not apply Terraform changes from an automated session.

## 10. Data flow (example: a user marks an event "Interested")

1. The user clicks "Interested?" on the event page.
2. The browser sends `PUT /me/plans/{event_id}` to the API.
3. The API makes sure that the user is signed in.
4. The API writes the plan to the `plans` table.
5. The API sends the plan back to the browser.
6. The site shows the lake dolphin after the event's name in its listing row.
