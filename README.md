# CyberGetaway — UPI Checkout & Payment Tracker

CyberGetaway provides a hosted UPI checkout page and a private merchant dashboard for a single merchant. It can be integrated into other websites using a server-to-server API. It is **not a regulated payment gateway** and does not provide bank-confirmed automatic payment callbacks, card acquiring, settlement, or escrow. UPI payments must be checked in the merchant's bank/UPI app and manually marked PAID in the dashboard.

## Checkout experience

- QR code for scanning from another phone.
- UPI intent button and app choices labelled Google Pay, PhonePe, Paytm and other UPI apps. Android decides which installed UPI app opens; availability depends on the device.
- Order amount and merchant details.
- Checkout status polling. It remains pending until the merchant verifies the actual bank transaction.
- No debit/credit card processing. Card acceptance requires an authorised acquiring/payment provider and is outside this UPI-only project.

## Integrate another website

Keep `MERCHANT_API_KEY` on your website's **server only**. Never put it in frontend JavaScript, HTML, a mobile app, or a public repository.

Create an intent from your website backend:

```http
POST https://YOUR-CYBERGETAWAY-HOST/api/gateway/payment-intents
Content-Type: application/json
X-API-Key: YOUR_MERCHANT_API_KEY

{
  "orderId": "ORDSHOP12345",
  "amount": 249.00,
  "customerName": "Customer",
  "returnUrl": "https://your-store.example/payment-result"
}
```

Example Node.js backend:

```js
const response = await fetch(process.env.CYBERGETAWAY_URL + '/api/gateway/payment-intents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.CYBERGETAWAY_API_KEY
  },
  body: JSON.stringify({
    orderId: 'ORDSHOP12345',
    amount: 249,
    customerName: 'Customer',
    returnUrl: 'https://your-store.example/payment-result'
  })
});
const payment = await response.json();
if (!response.ok) throw new Error(payment.error || 'Payment intent failed');
// Redirect the customer's browser to payment.checkoutUrl.
```

The `amount` is dynamic per order: send `49`, `199`, `499`, or any valid INR amount (₹1–₹10,00,000, up to 2 decimal places). No default amount needs to be configured for integrated websites. The API returns `checkoutUrl`. Redirect the customer's browser there. The checkout page is hosted by CyberGetaway, so the merchant API key is never exposed to the customer.

After checkout, your backend can securely query the status:

```http
GET /api/gateway/payment-intents/ORDSHOP12345
X-API-Key: YOUR_MERCHANT_API_KEY
```

Only trust the authenticated server-side status response. Do not fulfil orders from the browser return URL or a customer screenshot. A browser redirect is not proof of payment.

## Android payment-alert monitor (manual review only)

The companion Android app can send a filtered incoming-payment alert to CyberGetaway. Configure the app endpoint as:

`https://YOUR-CYBERGETAWAY-HOST/api/webhook/payment-alerts`

The app signs each request with HMAC-SHA256 using the same `WEBHOOK_SECRET` configured on the CyberGetaway server. Signature input:

`deviceId|fingerprint|amount|X-Cyber-Timestamp`

Headers: `X-Device-Id`, `X-Cyber-Timestamp` (13-digit Unix milliseconds), and `X-Cyber-Signature` (64-character lowercase hex HMAC). Requests older than five minutes are rejected.

Only incoming `RECEIVED` alerts are accepted. Send only amount, currency, transaction type, transaction reference, transaction timestamp, device ID and a SHA-256 fingerprint. Do not send complete SMS text, OTPs, sender phone numbers, account details or message snippets. The server stores the minimum transaction metadata in `payment_alerts` and displays it under Payments → SMS Payment Monitor.

A unique amount match is only a suggested order match. Alerts remain `REVIEW_REQUIRED`; this endpoint never marks an order PAID. The merchant must independently verify the actual credit in their bank/UPI app and use the normal dashboard “Mark paid” action. Raw SMS upload at `POST /api/webhook/sms` is disabled.

## Setup

1. Use Node.js 18 or newer.
2. Copy `.env.example` to `.env` and set strong, unique secrets.
3. Set `VPA` to your own UPI ID, `MERCHANT_NAME`, `PUBLIC_BASE_URL`, and `MERCHANT_API_KEY`. `DEFAULT_AMOUNT` is optional and is used only by the standalone demo homepage; integrated websites send their own amount with each payment-intent request.
4. On Render, use Node.js 22, Build Command `yarn install`, and Start Command `node server.js`. Locally, run `yarn install` and `yarn start`.
5. Customer checkout: `/checkout.html?token=...`; public landing page: `/`; merchant dashboard: `/admin` or `/dashboard.html`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | Private dashboard password |
| `SESSION_SECRET` | Admin session signing secret |
| `WEBHOOK_SECRET` | HMAC secret shared with the merchant-owned Android alert app |
| `MERCHANT_API_KEY` | Secret server-to-server key for website integration |
| `VPA` | Merchant UPI ID |
| `MERCHANT_NAME` | Merchant display name |
| `DEFAULT_AMOUNT` | Optional fixed amount for the standalone homepage only; not used by the integration API |
| `PUBLIC_BASE_URL` | Public CyberGetaway base URL used in checkout links |
| `DB_PATH` | Optional path for persistent SQLite database |
| `CORS_ORIGIN` | Allowed browser origins; API key must still remain server-side |

## Main endpoints

- `POST /api/gateway/payment-intents` — create checkout (API key required).
- `GET /api/gateway/checkout/:token` — public checkout details by unguessable token.
- `GET /api/gateway/payment-intents/:orderId` — authenticated status lookup.
- `POST /api/orders/create` — admin-authenticated one-off checkout link with a dynamic amount.
- `GET /api/orders` and `GET /api/orders/stats/summary` — admin dashboard data.
- `GET /api/admin/config` — non-secret merchant configuration for the signed-in dashboard.
- `PATCH /api/orders/:orderId/mark-paid` — manual merchant verification.
- `POST /api/webhook/payment-alerts` — signed, filtered incoming-payment alert; never confirms payment.
- `POST /api/webhook/ping` — signed app connectivity test.
- `GET /api/webhook/payment-alerts` — admin-authenticated SMS Payment Monitor list.
## Important

UPI QR and intent links only request a payment. They do not verify receipt. The merchant must confirm the transaction in their bank/UPI app before marking it PAID. Do not collect UPI PINs, OTPs, card numbers, CVVs, or banking passwords on this website. For debit/credit cards or automatic bank verification, use an appropriately authorised payment/acquiring provider and comply with applicable rules. SQLite needs persistent storage and backups to survive host replacement. Render's ordinary filesystem is ephemeral; configure a persistent disk and set `DB_PATH` to a path on that disk, or migrate to a managed database, before relying on long-term order storage. The dashboard is mobile-responsive and uses a fixed bottom navigation on phones.
