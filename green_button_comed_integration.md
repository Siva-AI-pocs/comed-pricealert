# ComEd Green Button Integration — App Spec

> **Purpose:** Reference document for implementing ComEd residential usage data access in a price monitoring/alert app using Green Button Connect My Data (CMD).

---

## Table of Contents

1. [Overview](#1-overview)
2. [How Green Button Works](#2-how-green-button-works)
3. [Actors & Roles](#3-actors--roles)
4. [Authorization Flow (Phase 1)](#4-authorization-flow-phase-1)
5. [Data Access Flow (Phase 2)](#5-data-access-flow-phase-2)
6. [ComEd Third-Party Registration](#6-comed-third-party-registration)
7. [Data Format](#7-data-format)
8. [PII & Compliance Rules](#8-pii--compliance-rules)
9. [Integration Options](#9-integration-options)
10. [Implementation TODOs](#10-implementation-todos)

---

## 1. Overview

Green Button Connect My Data (CMD) is the official, utility-sanctioned standard for third-party apps to access a customer's energy usage data. ComEd supports it for residential accounts with AMI (smart) meters.

**Standard:** NAESB REQ.21 — Energy Services Provider Interface (ESPI)
**Auth protocol:** OAuth 2.0
**Data format:** XML (Atom Syndication Format)
**Data granularity:** 15-minute interval consumption data (next-day availability)
**Illinois legal requirement:** Customer must explicitly opt-in before any data sharing (Illinois PIPA compliant)

---

## 2. How Green Button Works

```
Customer → ComEd Portal (login + consent) → OAuth Token → Your App → ComEd API → Usage Data
```

Two phases:

| Phase | When | What happens |
|-------|------|-------------|
| Phase 1 – Authorization | One-time per customer | Customer logs into ComEd, approves data sharing, your app receives an OAuth token |
| Phase 2 – Data access | Automated, recurring | Your app uses the token to pull 15-min interval data from ComEd's ESPI API |

---

## 3. Actors & Roles

| Actor | Green Button Term | Role |
|-------|------------------|------|
| Customer | RetailCustomer | Owns the data, grants/revokes consent |
| ComEd | DataCustodian | Holds meter data, runs OAuth server and ESPI API |
| Your app | ThirdParty | Registered service that receives authorized data access |

---

## 4. Authorization Flow (Phase 1)

> Runs **once per customer**. Your app never sees the customer's ComEd username or password.

### Step-by-step

1. **Your app** displays a "Connect ComEd" button
2. Customer clicks it — browser redirects to `https://secure.comed.com` with your `client_id` and `redirect_uri`
3. Customer logs in on ComEd's website and approves data sharing on the **ComEd consent screen**
4. ComEd redirects back to your `redirect_uri` with an **authorization code**
5. Your backend exchanges the code for:
   - `access_token` — used for API calls
   - `refresh_token` — used to get new access tokens when they expire
6. Store tokens securely (encrypted at rest); never expose to frontend

### OAuth 2.0 parameters

```
Authorization endpoint: https://secure.comed.com/MyAccount/MyBillUsage/pages/GBCThirdPartyReg.aspx
Grant type: authorization_code
Scope: FB=4_5_15;IntervalDuration=900;BlockDuration=monthly;HistoryLength=13
```

> **Scope breakdown:**
> - `FB=4_5_15` — UsagePoint, MeterReading, IntervalBlock
> - `IntervalDuration=900` — 15-minute intervals (900 seconds)
> - `BlockDuration=monthly` — Monthly billing blocks
> - `HistoryLength=13` — Up to 13 months of history

### What to store per customer

```json
{
  "customerId": "internal-uuid",
  "comed_access_token": "<encrypted>",
  "comed_refresh_token": "<encrypted>",
  "comed_token_expires_at": "ISO-8601 timestamp",
  "comed_subscription_id": "<from ESPI API after auth>",
  "authorized_at": "ISO-8601 timestamp",
  "consent_revoked": false
}
```

---

## 5. Data Access Flow (Phase 2)

> Automated after Phase 1. Runs on schedule (daily or on-demand).

### Step-by-step

1. **Your app** checks if `access_token` is valid; refresh if expired using `refresh_token`
2. Call ComEd's ESPI API with Bearer token:

```http
GET https://api.comed.com/GreenButton/espi/1_1/resource/Subscription/{subscription_id}/UsagePoint/{usage_point_id}/MeterReading
Authorization: Bearer {access_token}
Accept: application/atom+xml
```

3. ComEd returns **XML** with 15-minute interval usage data
4. Parse XML → extract `IntervalReading` values (kWh per 15-min slot)
5. Compare usage data against **ComEd's real-time/hourly pricing** (from ComEd Hourly Pricing API — separate public API, no auth required)
6. **Fire alert** if usage × price crosses user-defined threshold

### Key ESPI endpoints

| Resource | Endpoint |
|----------|----------|
| Subscription | `/espi/1_1/resource/Subscription/{id}` |
| UsagePoint | `/espi/1_1/resource/Subscription/{id}/UsagePoint` |
| MeterReading | `.../UsagePoint/{id}/MeterReading` |
| IntervalBlock | `.../MeterReading/{id}/IntervalBlock` |
| Notification (push) | Webhook registered at third-party registration |

### Data notification (push model)

ComEd can push data to your app via a **Notification POST** instead of polling:

```
ComEd → POST https://yourapp.com/notify → BatchList of resource URIs → Your app GETs each URI
```

The notification payload contains no PII — only resource URIs. Your app must have a valid `access_token` to retrieve the actual data.

---

## 6. ComEd Third-Party Registration

> Must be completed **before** any customer can authorize your app.

### Registration URL
```
https://secure.comed.com/MyAccount/MyBillUsage/pages/GBCThirdPartyReg.aspx
```

### What ComEd will ask for

- Company/app name and description
- Redirect URI(s) for OAuth callback
- SSL certificate for your notification endpoint
- Contact information
- Intended use case

### Timeline

- Review: ~10 business days
- Connectivity testing: several weeks (email back-and-forth)
- Production publishing: days to months after testing passes

### Alternative: UtilityAPI middleware

If the direct registration timeline is too slow for your MVP:

- **UtilityAPI** (https://utilityapi.com) handles registration, hosting, and data parsing on your behalf
- Customers authorize via a simplified flow
- You access data through UtilityAPI's normalized REST API (same data, abstracted format)
- Trade-off: third-party dependency, per-account pricing

---

## 7. Data Format

ComEd returns data in **ESPI XML (Atom Syndication Format)**. Key elements:

```xml
<feed>
  <entry>
    <content>
      <UsagePoint>
        <ServiceCategory>
          <kind>0</kind> <!-- 0 = electricity -->
        </ServiceCategory>
      </UsagePoint>
    </content>
  </entry>
  <entry>
    <content>
      <IntervalBlock>
        <interval>
          <duration>86400</duration>       <!-- seconds in period -->
          <start>1700000000</start>        <!-- Unix timestamp -->
        </interval>
        <IntervalReading>
          <timePeriod>
            <duration>900</duration>       <!-- 15 min = 900 seconds -->
            <start>1700000000</start>      <!-- Unix timestamp of interval start -->
          </timePeriod>
          <value>1234</value>              <!-- Wh (divide by 1000 for kWh) -->
        </IntervalReading>
        <!-- ... more IntervalReading entries ... -->
      </IntervalBlock>
    </content>
  </entry>
</feed>
```

### Parsing notes

- `value` is in **Wh** (watt-hours). Divide by 1000 for kWh.
- `start` is a **Unix timestamp** (UTC). Convert to local time for display.
- Data is typically available **next day** (not real-time).
- 15-min interval = 96 readings per day per meter.

---

## 8. PII & Compliance Rules

### What IS PII in this context

- Customer name, address, account number
- Precise usage patterns that could infer behavior (home/away, sleep schedules)
- ComEd login credentials

### What is NOT PII

- OAuth access tokens (no account info embedded — ComEd resolves server-side)
- Aggregated or anonymized usage data
- ZIP-code level usage data (ComEd's Anonymous Data Service)

### Rules your app MUST follow

| Rule | Requirement |
|------|-------------|
| Opt-in consent | Customer must explicitly authorize via ComEd's consent screen before any data access |
| No credential storage | Never store ComEd username/password — OAuth tokens only |
| Token encryption | Store `access_token` and `refresh_token` encrypted at rest (AES-256 minimum) |
| Token in transit | Always use HTTPS; never pass token in URL parameters |
| Revocation support | Must honor customer revocation — check token validity; stop polling on 401 |
| Data minimization | Only request the scopes you actually use |
| Retention policy | Define and enforce how long usage data is stored; delete on account closure |
| Illinois PIPA | Illinois Personal Information Protection Act applies — notify users of data breach within 30 days |
| No reselling | Do not sell or share individual customer usage data with third parties |

### Consent UI requirements (recommended)

Display clearly before redirecting to ComEd:
- What data you will access (15-min interval usage)
- How long you will retain it
- How to revoke access (via ComEd account settings)
- Link to your privacy policy

---

## 9. Integration Options

| Option | MVP? | Auth | Complexity | Cost |
|--------|------|------|------------|------|
| **Green Button CMD (direct)** | No | OAuth 2.0 via ComEd | High — requires registration | Free (ComEd API) |
| **UtilityAPI middleware** | Yes | UtilityAPI OAuth | Medium | Per-account fee |
| **Green Button Download (manual)** | Yes | Customer self-service | Low — no backend auth | Free |

### Recommended path

1. **MVP:** Manual Green Button Download — customer exports CSV/XML from ComEd, uploads to your app
2. **v1.0:** UtilityAPI for faster third-party access while ComEd registration is pending
3. **v2.0:** Direct Green Button CMD after ComEd registration completes

---

## 10. Implementation TODOs

### Registration & Setup
- [ ] Register as third-party provider at ComEd Green Button registration page
- [ ] Set up SSL certificate for notification webhook endpoint
- [ ] Define redirect URIs for OAuth callback (dev + prod)
- [ ] Apply for UtilityAPI account as fallback for MVP

### Backend
- [ ] Implement OAuth 2.0 authorization code flow (PKCE recommended)
- [ ] Implement token storage (encrypted, per customer)
- [ ] Implement token refresh logic (before expiry)
- [ ] Implement ESPI XML parser for `IntervalBlock` / `IntervalReading`
- [ ] Build usage data model (customer → date → 15-min slots → kWh)
- [ ] Set up notification webhook endpoint (`POST /notify`)
- [ ] Implement polling fallback (daily cron if push not configured)
- [ ] Add consent revocation handler (401 → mark customer as deauthorized)

### Alert Logic
- [ ] Fetch ComEd hourly pricing (separate public API — no auth)
- [ ] Join usage data with price data by timestamp
- [ ] Implement alert threshold configuration per customer
- [ ] Implement alert delivery (email / push / SMS)

### Frontend / UX
- [ ] "Connect ComEd" button with pre-consent disclosure
- [ ] OAuth redirect + callback handling
- [ ] Usage dashboard (daily/hourly charts from interval data)
- [ ] Alert settings UI (threshold, notification channel)
- [ ] "Disconnect ComEd" / revoke access flow

### Compliance
- [ ] Privacy policy covering Green Button data
- [ ] Data retention policy + enforcement (auto-delete after N days)
- [ ] Breach notification procedure (Illinois PIPA — 30-day window)
- [ ] Audit log for data access events

---

## References

- ComEd Green Button registration: https://secure.comed.com/MyAccount/MyBillUsage/pages/GBCThirdPartyReg.aspx
- ComEd Green Button info: https://www.comed.com/SmartEnergy/InnovationTechnology/Pages/GreenButtonConnect.aspx
- Green Button developer docs: https://green-button.github.io/developers/
- ESPI standard (NAESB REQ.21): https://www.naesb.org
- UtilityAPI (middleware option): https://utilityapi.com
- Green Button Alliance: https://www.greenbuttonalliance.org
- ComEd Anonymous Data Service (ZIP-level, no auth): https://openenergyhub.ornl.gov/explore/dataset/comed-s-anonymized-ami-energy-usage-data/

---

*Last updated: March 2026 | App: ComEd Electric Price Monitoring & Alert*
