# Sample friends

The preview database includes eight ready-made friend accounts for testing
following, friends-going, and attendee previews.

All accounts use the password `MigoFriend2026!`.

| Email | Name | Interests |
| --- | --- | --- |
| sara.friend@migo.test | Sara Al Mansoori | Music, Arts & Culture, Food |
| omar.friend@migo.test | Omar Haddad | Sports, Technology, Business |
| layla.friend@migo.test | Layla Khan | Wellness, Family, Arts & Culture |
| yousef.friend@migo.test | Yousef Rahman | Music, Nightlife, Comedy |
| noor.friend@migo.test | Noor Abdulla | Exhibition, Conference, Technology |
| khalid.friend@migo.test | Khalid Saeed | Sports, Family, Food |
| maya.friend@migo.test | Maya Fernandes | Arts & Culture, Theatre, Music |
| adam.friend@migo.test | Adam Mikhail | Technology, Business, Nightlife |

## Seed or refresh

From the repository root:

```bash
cd apps/backend
npm run seed:friends
```

The script is idempotent. It upserts the users, confirmed bookings, and
follows. Each account shares two upcoming Dubai events and receives additional
bookings selected from upcoming Dubai or Abu Dhabi events matching its
interests. Sara, Omar, and Layla follow the standard test account, and the
sample accounts form a follow ring.

## What to test

1. Log in as `migo.test.20260921@example.com`.
2. Open Profile → Find friends and browse Suggested for you.
3. Follow Sara, then open one of the shared events to see friends-going and
   the attendee preview.
4. Open Profile → Followers to see Sara, Omar, and Layla.
