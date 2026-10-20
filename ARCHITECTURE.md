# Culture Crew: app structure

This document uses the rules of ASD-STE100 Simplified Technical English. No STE checker has verified it.

## Diagrams

The overview shows the parts and how they connect.

![Overview: the browser, the site, the API server and the AWS services](docs/architecture/1-overview.svg)

This diagram shows what runs on the API server and the tables in the database.

![Inside the API server: Caddy, the api container, the jobs and the database](docs/architecture/2-api-server.svg)

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
| API | `cc-backend` | Keeps the events, users, plans and venues. Sends emails. |
| Infrastructure | `cc-backend/infra/aws` | Defines the AWS resources. |

## 2. The site

The site has these files:
- `public/index.html`: the HTML.
- `public/css/site.css`: the styles.
- `public/js/`: the scripts, one file for each area of the site.

The page loads the scripts in a fixed order. All the scripts share one global scope.
The site does not have a build step. At deploy, a script adds a content hash to each link to a style or script file.
Thus, browsers can keep these files for one year and still get each new version.

Amazon S3 keeps the files.
Amazon CloudFront sends the files to the user's browser.
The browser runs the JavaScript.
The JavaScript gets the data from the API.

The site has these views:
- Home
- Catalog
- Plan an outing
- Submit an event
- Your account
- Review (admins only)
- Venues (admins only)

The site has two themes: dark and light.
The user can change the theme with the theme button.

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
| `/me` | "I've been" marks, plans, the user's submissions | The signed-in user only |
| `/admin` | Review queue, scheduled events, withdrawn events | Admins only |
| `/venues` | Show, rename, merge and delete venues | All users can read. Admins can change. |
| `/traffic` | Count a page view, a click to an event's page, or a planned outing. No cookies. | All visitors (the site sends it) |

## 4. The database

The database is PostgreSQL 16 on Amazon RDS.
Only the API can connect to the database.
Alembic controls changes to the database structure.
Each change is a numbered migration in `cc-backend/alembic/versions`.
The deploy applies new migrations automatically.

The database has these main tables:
- `users`: the accounts.
- `events`: the events.
- `venues`: the places where the events occur.
- `attended`: the "I've been" marks.
- `plans`: the "interested" and "going" plans.

## 5. The Google Sheet sync

A Google Sheet is the second source of events.
A scheduled task runs the sync one time each night.
The sync reads the sheet and updates the events in the database.

> **CAUTION:** The sync replaces the data of sheet events. If you edit a sheet event on the site, the sync removes your change. Make the change in the sheet.

## 6. Email

The API sends email with Amazon SES in the us-east-1 region.
The API sends two types of email: email confirmation and password reset.
The API uses short-lived credentials. These credentials can only send email.

> **NOTE:** SES is in its sandbox at this time. SES sends email only to verified addresses.

## 7. Deployment

GitHub Actions tests each pull request.
When you merge a pull request into `main`, GitHub Actions deploys the change.
GitHub Actions uses OIDC to get access to AWS. It does not keep AWS keys.

Terraform defines the AWS resources: S3, CloudFront, EC2, RDS, SES, Route 53 and IAM.

> **WARNING:** Only the product owner applies Terraform changes. Do not apply Terraform changes from an automated session.

## 8. Data flow (example: a user marks an event "Interested")

1. The user clicks "Interested?" on an event card.
2. The browser sends `PUT /me/plans/{event_id}` to the API.
3. The API makes sure that the user is signed in.
4. The API writes the plan to the `plans` table.
5. The API sends the plan back to the browser.
6. The site shows the dolphin next to the date on the card.
