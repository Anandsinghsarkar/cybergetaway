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

The API returns `checkoutUrl`. Redirect the customer's browser there. The checkout page is hosted by CyberGetaway, so the merchant API key is never exposed to the customer.

After checkout, your backend can securely query the status:

```http
GET /api/gateway/payment-intents/ORDSHOP12345
X-API-Key: YOUR_MERCHANT_API_KEY
```

Only trust the authenticated server-side status response. Do not fulfil orders from the browser return URL or a customer screenshot. A browser redirect is not proof of payment.

## Setup

1. Use Node.js 18 or newer.
2. Copy `.env.example` to `.env` and set strong, unique secrets.
3. Set `VPA` to your own UPI ID, `MERCHANT_NAME`, `PUBLIC_BASE_URL`, and `MERCHANT_API_KEY`.
4. Run `npm install` and `npm start`.
5. Customer checkout: `/checkout.html?token=...`; admin dashboard: `/dashboard.html`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | Private dashboard password |
| `SESSION_SECRET` | Admin session signing secret |
| `WEBHOOK_SECRET` | SMS webhook secret (optional SMS review flow) |
| `MERCHANT_API_KEY` | Secret server-to-server key for website integration |
| `VPA` | Merchant UPI ID |
| `MERCHANT_NAME` | Merchant display name |
| `PUBLIC_BASE_URL` | Public CyberGetaway base URL used in checkout links |
| `DB_PATH` | Optional path for persistent SQLite database |
| `CORS_ORIGIN` | Allowed browser origins; API key must still remain server-side |

## Main endpoints

- `POST /api/gateway/payment-intents` — create checkout (API key required).
- `GET /api/gateway/checkout/:token` — public checkout details by unguessable token.
- `GET /api/gateway/payment-intents/:orderId` — authenticated status lookup.
- `GET /api/orders` and `GET /api/orders/stats/summary` — admin dashboard data.
- `PATCH /api/orders/:orderId/mark-paid` — manual merchant verification.
- `POST /api/webhook/sms` — optional SMS review candidate; SMS never confirms payment.

## Important

UPI QR and intent links only request a payment. They do not verify receipt. The merchant must confirm the transaction in their bank/UPI app before marking it PAID. Do not collect UPI PINs, OTPs, card numbers, CVVs, or banking passwords on this website. For debit/credit cards or automatic bank verification, use an appropriately authorised payment/acquiring provider and comply with applicable rules. SQLite needs persistent storage and backups to survive host replacement.
