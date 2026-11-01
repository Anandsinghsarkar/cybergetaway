# Private UPI Payment Tracker

A single-merchant website for creating UPI payment requests and tracking your own business orders. It is not a payment gateway and does not connect to Razorpay or any other payment provider. UPI payments are verified manually by the merchant before an order is marked PAID.

## File structure

- `server.js` — Express app, admin session, health endpoint and optional self-ping.
- `database.js` — SQLite database and order schema.
- `routes/orders.js` — Order creation, private listing, stats and status updates.
- `routes/webhook.js` — Secret-protected SMS parser that creates unverified review candidates.
- `public/index.html` — Customer UPI payment page and QR.
- `public/dashboard.html` — Private admin dashboard.
- `.env.example` — Environment variable template.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and set strong private values.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`; open `/dashboard.html` for admin sign-in.

## API endpoints

- `POST /api/orders/create` — Create a pending order.
- `GET /api/orders/:orderId` — Read the public status of one order.
- `POST /api/admin/login` and `POST /api/admin/logout` — Admin session.
- `GET /api/orders` — Admin-only order list.
- `GET /api/orders/stats/summary` — Admin-only totals.
- `PATCH /api/orders/:orderId/mark-paid` — Admin-only payment confirmation.
- `PATCH /api/orders/:orderId/status` — Admin-only non-paid status update.
- `POST /api/webhook/sms` — Secret-protected SMS review candidate.
- `GET /health` — Health check.

## Environment variables

| Variable | Purpose |
| --- | --- |
| PORT | HTTP port (default 3000) |
| SELF_URL | Optional URL used by the 10-minute health ping |
| ADMIN_PASSWORD | Private admin login password |
| SESSION_SECRET | Secret used to sign admin session cookies |
| WEBHOOK_SECRET | Secret header required by the SMS endpoint |
| CORS_ORIGIN | Comma-separated allowed browser origins |
| VPA | Merchant UPI ID (set in the customer page constant) |
| MERCHANT_NAME | Merchant display name |
| DEFAULT_AMOUNT | Default amount shown on the customer page |
| DB_PATH | Optional SQLite file path |

## SMS forwarding concept

A trusted SMS-forwarding application can send the received bank notification text to `POST /api/webhook/sms` with JSON `{"message":"..."}` and the `x-webhook-secret` header. The parser only marks a matching order `UNVERIFIED`; it never treats SMS text as proof of payment. Check the actual bank or UPI app transaction before using the dashboard's Verify & Mark Paid action.

**Important:** UPI intent links and QR codes only request payment; they do not confirm that money arrived. SMS text can be delayed, duplicated, incomplete or spoofed. Keep admin and webhook secrets private. SQLite data is stored in the configured local file; use a persistent database volume and separate backups if you need data to survive host replacement.
