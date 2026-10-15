# Beta — Product Overview

## Purpose
Beta is a voice-first business recordkeeping web app for Nigerian informal traders (market sellers, small shop owners). It lets traders record sales, expenses, debts, stock movements, and ajo (rotating savings) using voice commands in Nigerian English, Yoruba, Hausa, or Igbo — with manual fallback for every action.

## Value Proposition
- Lowers the literacy/typing barrier: traders speak transactions in their language; Beta transcribes, interprets, and asks for confirmation before saving
- Runs entirely in the browser — no separate mobile app
- Generates a printable/downloadable Business Activity Passport (period financial summary) that traders can use to demonstrate business activity

## Primary User Journey (`/start`)
1. Silent Supabase Anonymous Auth (no email required)
2. Language selection (en / yo / ha / ig)
3. Three voice answers (name, product category, business name)
4. Redirected into the app dashboard

## Key Features
- **Sales**: voice or manual checkout, preview before confirm, payment status tracking, reversal with stock restoration
- **Inventory**: product CRUD, cost/selling price, low-stock alerts, stock movement history, restock
- **Expenses**: categorised expense recording with date, period summaries
- **Customer Debts**: debt recording, repayment tracking, balance calculation
- **Ajo**: rotating savings group recordkeeping (contributions + payouts), no money held
- **Business Activity Passport**: period-based printable report with sales, expenses, inventory, debt, and ajo data; JSON download
- **Dashboard analytics**: today/week/month sales, 30-day trend chart, low-stock alerts, estimated profit, recent sales
- **Guided journey**: 5-step onboarding guide (add product → sale → expense → debt → summary); skippable, pausable, replayable
- **Voice assistant**: N-ATLAS ASR (NCAIR models) for transcription; controlled intent engine for interpretation; YarnGPT TTS for spoken replies
- **Settings**: trader name, preferred language, business profile, negative-stock toggle

## What Is Mocked / Labelled Demo
- Ambient sale recognition (no background listening, never saves automatically)
- Cooperative passport review
- Credit-readiness indicators
These are clearly labelled prototypes with sample data only.

## Target Users
Nigerian informal/micro traders who conduct business in Nigerian English, Yoruba, Hausa, or Igbo and need simple financial recordkeeping without accounting software complexity.

## Routes
| Path | Description |
|------|-------------|
| `/` | Public landing page |
| `/start` | Primary onboarding (anonymous auth + voice setup) |
| `/app` | Dashboard (overview, analytics) |
| `/app/checkout` | Sale recording (voice or manual) |
| `/app/inventory` | Product management |
| `/app/sales` | Sales history + reversal |
| `/app/expenses` | Expense recording + history |
| `/app/debts` | Customer debt + repayment |
| `/app/ajo` | Ajo group recordkeeping |
| `/app/passport` | Business Activity Passport |
| `/app/settings` | Profile + business settings |
| `/auth` | Legacy email/password auth (feature-flagged off) |
