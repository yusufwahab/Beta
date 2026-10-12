BETA — COMPLETE FULL-STACK WEB APPLICATION IMPLEMENTATION PROMPT

YOUR ROLE

You are a senior full-stack software engineer, React.js specialist, TypeScript developer, Node.js backend engineer, database architect, AI integration engineer, and expert UI/UX designer.

Your task is to build BETA, a complete, production-oriented, voice-first business management web application for Nigerian informal traders.

IMPORTANT: THIS PROJECT IS EXCLUSIVELY A REACT.JS WEB APPLICATION.

Use React.js, TypeScript, Vite, and Tailwind CSS for the frontend.
Tailwind has been installed and configured

Do not create a separate mobile application, mobile framework project, or additional frontend platform.

The React web application must be fully responsive and deliver an excellent mobile-browser experience.

EXECUTION REQUIREMENT: Implement the entire application directly. Avoid lengthy planning, repeated approval requests, unnecessary documentation, and excessive commentary. Work autonomously, making reasonable technical decisions while preserving all requirements.

---

1. PRODUCT OVERVIEW

Product Name: Beta

Tagline: Your Business. Your Voice. Your Financial Identity.

Beta is a multilingual, voice-first business management platform designed for Nigerian informal traders, including market women, shopkeepers, roadside vendors, elderly traders, low-literacy users, and people with visual impairments.

Beta helps traders manage their daily business activities through natural voice interactions.

The platform uses N-ATLAS speech recognition and language understanding to interpret spoken business instructions and convert them into structured, verifiable records.

Core capabilities

1. Voice-powered sales checkout
2. Manual sales recording
3. Product and inventory management
4. Business expense tracking
5. Customer debt management
6. Ajo contribution tracking
7. Business dashboard and analytics
8. Business Activity Passport
9. Multilingual interaction
10. Ambient-assisted checkout demonstration

The primary objective is to make everyday business management accessible to traders who may struggle with traditional accounting applications.

Beta must not claim to issue loans, provide verified credit scores, hold funds, or independently verify transactions without supporting evidence.

---

2. MANDATORY TECHNOLOGY STACK

Frontend

- React.js
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- Lucide React
- Recharts for analytics
- React Hook Form and Zod where appropriate

Backend

- Node.js
- Express.js
- TypeScript
- Zod
- REST APIs

Database and authentication

- Supabase PostgreSQL
- Supabase Auth
- PostgreSQL transactions and constraints
- Row Level Security

AI integration

- Official N-ATLAS ASR
- N-ATLAS LLM
- Secure server-side HTTP requests

Architecture

Use a straightforward TypeScript monorepo:

beta/
├── apps/
│ └── web/
│ ├── public/
│ ├── src/
│ │ ├── assets/
│ │ ├── components/
│ │ ├── layouts/
│ │ ├── pages/
│ │ ├── hooks/
│ │ ├── services/
│ │ ├── contexts/
│ │ ├── lib/
│ │ ├── styles/
│ │ ├── App.tsx
│ │ └── main.tsx
│ ├── index.html
│ ├── vite.config.ts
│ └── package.json
├── server/
│ ├── src/
│ │ ├── controllers/
│ │ ├── routes/
│ │ ├── services/
│ │ ├── middleware/
│ │ ├── validators/
│ │ ├── db/
│ │ ├── utils/
│ │ └── index.ts
│ └── package.json
├── packages/
│ └── shared/
├── supabase/
│ └── migrations/
├── .env.example
├── package.json
└── README.md

Avoid unnecessary dependencies, microservices, and infrastructure.

---

3. UI/UX DESIGN — FOLLOW THE ATTACHED IMAGE

The attached image is the primary visual design reference for Beta.

Study the image carefully before implementing the frontend.

Replicate its visual direction, composition, premium appearance, and layout patterns while replacing all content with Beta-specific content.

Do not copy the reference website's brand identity or unrelated content.

Design system

Use Tailwind CSS throughout the frontend.

Suggested palette:

- Primary background: "#080910"
- Secondary background: "#0B0D14"
- Card background: "#101722"
- Cyan accent: "#00C7CC"
- Purple accent: "#5145F5"
- Primary text: "#F8FAFC"
- Secondary text: "#94A3B8"
- Subtle borders: "#263041"

Use:

- Premium dark backgrounds
- Subtle grid patterns
- Cyan gradients and highlights
- Purple pill-shaped CTA buttons
- Large, bold headlines
- Rounded cards
- Soft shadows and glow effects
- Modern typography
- Consistent spacing
- Smooth, lightweight transitions
- Professional dashboard layouts
- Clear information hierarchy

Configure reusable Tailwind theme tokens.

Avoid scattered hardcoded styles and unnecessary CSS files.

Landing page

Build a premium, fully responsive landing page following the reference image's layout.

Navigation

Create a floating, rounded navigation bar containing:

- Beta logo
- Features
- How It Works
- Why Beta
- About
- Sign In
- Get Started

On mobile browsers, use a clean collapsible navigation menu.

Hero section

Use a two-column layout on desktop.

Left side:

Large headline:

"Your Business. Your Voice. Your Financial Identity."

Supporting description:

"Manage your sales, inventory, expenses, and everyday business activities simply by speaking. Beta makes business management easier and more accessible for Nigerian traders."

Primary CTA: Get Started Free

Secondary CTA: See How It Works

Include small trust and accessibility indicators.

Right side:

Create a premium visual collage showing Beta's actual interface:

- Voice checkout panel
- Sales dashboard
- Inventory summary
- Financial analytics
- Business Activity Passport preview

Use overlapping rounded cards, realistic interface previews, subtle glows, and attractive composition.

Do not rely on generic stock photographs as the primary hero visual.

Additional landing sections

Implement:

1. Turquoise feature strip
2. Problems faced by informal traders
3. How Beta solves these problems
4. Voice checkout showcase
5. Multilingual interaction showcase
6. Inventory and sales management
7. Customer debts and ajo tracking
8. Business Activity Passport
9. How Beta works
10. Accessibility benefits
11. Final call-to-action
12. Professional footer

The entire landing page should feel cohesive, modern, and polished.

---

4. AUTHENTICATED WEB APPLICATION UI

Design a complete responsive business management interface using the same design system.

The dashboard must be simpler and more functional than the marketing landing page.

Desktop navigation

Use a collapsible sidebar containing:

- Overview
- Voice Checkout
- Sales
- Inventory
- Expenses
- Customers & Debts
- Ajo Savings
- Business Activity Passport
- Ambient Demo
- Settings

Include user profile, business name, logout, and language preferences.

Mobile-browser navigation

Use a compact bottom navigation for the most important destinations, with a menu for secondary features.

Ensure:

- Large touch targets
- Readable text
- Accessible forms
- Simple navigation
- Responsive tables
- Mobile-friendly cards
- Minimal scrolling for primary actions
- Visible microphone controls

The application must work well on small Android phone screens through a normal browser.

Do not make the user navigate complicated menus just to record a sale.

---

5. FULLY FUNCTIONAL FEATURES

These features must use real backend APIs and PostgreSQL data.

5.1 Authentication and onboarding

Implement:

- Account registration
- Login
- Logout
- Password recovery
- Supabase authentication
- Protected routes
- Business onboarding
- Business profile editing
- Preferred language
- Session persistence

During onboarding, collect:

- Trader's name
- Business name
- Business category
- Preferred language
- Optional business location
- Basic operating preferences

Keep onboarding short and accessible.

5.2 Voice checkout — HIGHEST PRIORITY

This is Beta's most important feature.

Implement genuine N-ATLAS-powered voice checkout.

Workflow

1. Trader opens Voice Checkout.
2. Trader presses the microphone button.
3. The browser requests microphone permission.
4. Browser records speech using supported browser recording APIs.
5. Recorded audio is securely uploaded to Express.
6. Backend sends the audio to N-ATLAS ASR.
7. N-ATLAS returns a transcription.
8. Backend sends the transcription and relevant business context to N-ATLAS LLM.
9. LLM extracts a structured transaction intent.
10. Backend validates the extracted information using Zod.
11. The interface displays the proposed transaction.
12. Trader reviews and edits the details if necessary.
13. Trader confirms.
14. Backend calculates the final totals and records the transaction atomically.
15. Inventory and dashboard data update.

Example

Trader says:

"I sold three bottles of groundnut oil for two thousand five hundred naira each."

Expected structured output:

{
"intent": "record_sale",
"items": [
{
"product_name": "Groundnut Oil",
"quantity": 3,
"unit_price": 2500
}
],
"payment_status": "unknown"
}

The backend must calculate the total as ₦7,500.

The LLM must never be trusted to calculate authoritative financial totals.

Voice checkout interface

Include:

- Large microphone button
- Recording state
- Recording duration
- Audio playback when appropriate
- Processing state
- Transcription preview
- Detected language when supported
- Extracted transaction details
- Editable products and quantities
- Total amount
- Payment status
- Confirm and cancel buttons
- Clear error handling

Do not save transactions automatically.

Do not invent missing quantities, prices, or payment details.

If the user's speech is ambiguous, request clarification or allow manual correction.

5.3 Manual checkout

Provide a simple alternative to voice checkout.

The trader can:

- Select products
- Enter quantities
- Set prices
- Review totals
- Record payment status
- Confirm the sale

Use the same backend transaction service as voice checkout.

5.4 Inventory management

Implement:

- Add products
- Edit products
- Delete or archive products
- Product categories
- Selling prices
- Stock quantities
- Stock restocking
- Low-stock warnings
- Inventory search
- Stock movement history

Sales should reduce available stock using database transactions.

Avoid negative stock unless explicitly supported by a business setting.

5.5 Sales management

Implement:

- Sales history
- Daily sales
- Weekly sales
- Monthly sales
- Transaction details
- Payment status
- Manual and voice transaction sources
- Search and filtering
- Safe correction or reversal workflows

Avoid destructive deletion of confirmed financial records.

5.6 Expense management

Implement:

- Record expenses
- Expense categories
- Expense descriptions
- Expense history
- Date filtering
- Daily and monthly summaries

Ensure all calculations use actual database records.

5.7 Dashboard and analytics

Create a visually polished dashboard displaying:

- Today's sales
- Weekly sales
- Monthly sales
- Expenses
- Estimated profit where cost data is available
- Inventory alerts
- Outstanding debts
- Recent transactions
- Sales trends

Use Recharts for visual analytics.

All values must come from real backend queries.

Do not use hardcoded financial statistics in authenticated production views.

If data is unavailable, show a helpful empty state.

---

6. SIMPLIFIED BUT FUNCTIONAL FEATURES

These features should be implemented using real database records without unnecessary complexity.

6.1 Customer debts

Implement:

- Customer records
- Debt creation
- Outstanding balances
- Repayment recording
- Repayment history
- Paid and unpaid statuses

Do not implement SMS reminders, external collection systems, or payment gateways.

6.2 Ajo savings

Implement:

- Savings groups
- Members
- Contribution records
- Contribution summaries
- Payout records
- Basic history

Ajo functionality is recordkeeping only.

Beta must not collect, hold, transfer, or distribute funds.

6.3 Business Activity Passport

Generate a professional, printable, downloadable business activity report.

Include:

- Business details
- Reporting period
- Sales summary
- Expense summary
- Transaction consistency
- Inventory activity
- Debt records
- Ajo contribution records
- Data completeness indicators

Use real business data.

Distinguish self-reported records from externally verified records.

Do not fabricate financial credibility, official verification, credit ratings, or loan eligibility.

Use browser printing or a lightweight PDF-generation solution.

---

7. MOCKED INTERACTIVE FEATURES

These features must be clearly labeled as demonstrations.

7.1 Ambient-assisted checkout

Create a polished Ambient Checkout Demo.

The purpose is to demonstrate how Beta could eventually recognize sales-related conversations and suggest transactions.

Demo experience

1. User opens Ambient Demo.
2. User selects or plays a predefined sample conversation.
3. Interface simulates conversation detection.
4. A transcript appears.
5. The system highlights relevant transaction details.
6. A suggested sale appears.
7. User can review, edit, confirm, or dismiss the suggestion.

Example:

"Give me two bottles of oil at ₦2,500 each."

Suggested transaction:

- Product: Oil
- Quantity: 2
- Unit price: ₦2,500
- Total: ₦5,000

Reuse the real checkout confirmation UI.

Show a visible Demo Mode indicator.

Do not implement continuous listening, background audio surveillance, physical proximity detection, or custom keyword detection.

Do not represent simulated recognition as genuine live N-ATLAS processing.

Keep demo records separate from production records.

7.2 Cooperative verification prototype

Create an interactive interface demonstrating how a cooperative or market association could review a trader's Business Activity Passport.

Use sample data.

Clearly label the feature as a prototype.

Do not implement actual external verification.

7.3 Credit-readiness demonstration

Create a sample interface showing how business records might support future credit applications.

Use explanatory indicators such as:

- Record completeness
- Transaction consistency
- Business activity history

Do not invent a credit score.

Do not claim a lender has assessed or approved the trader.

---

8. N-ATLAS INTEGRATION

Create a dedicated backend service:

"server/src/services/natlas.service.ts"

Use official N-ATLAS API documentation and configured credentials.

Environment variables

NATLAS_BASE_URL=
NATLAS_API_KEY=
NATLAS_ASR_MODEL=
NATLAS_LLM_MODEL=

Implement:

- Secure audio upload
- Audio format validation
- Supported language selection
- ASR transcription
- LLM interpretation
- Structured JSON extraction
- Zod validation
- Request timeouts
- Error handling
- Missing-credential handling
- Safe logging
- Clear API error responses

Support Yoruba, Hausa, Igbo, and Nigerian English only to the extent supported by the actual configured models.

Do not invent working API endpoints.

Do not substitute another AI provider without explicit permission.

If N-ATLAS access is unavailable, implement the adapter and clearly report the integration blocker.

Do not claim successful integration without a real successful API response.

---

9. DATABASE DESIGN

Use Supabase PostgreSQL.

Create migrations for:

- profiles
- businesses
- business_memberships
- products
- sales
- sale_items
- stock_movements
- expenses
- customers
- debts
- debt_repayments
- ajo_groups
- ajo_memberships
- ajo_contributions
- ajo_payouts
- voice_interactions
- transaction_suggestions
- activity_events

Implement:

- Primary keys
- Foreign keys
- Appropriate indexes
- Ownership relationships
- Row Level Security
- Appropriate check constraints
- Created and updated timestamps
- Audit information
- Transaction provenance
- Idempotency protection

Use appropriate PostgreSQL numeric types for monetary amounts.

Do not use floating-point arithmetic for authoritative financial calculations.

Financial writes must be transactional.

All business data must be scoped to the authorized business.

---

10. BACKEND API

Create REST endpoints for:

Authentication and business

- Current user
- Business onboarding
- Business profile
- User settings

Voice

- Audio transcription
- Intent interpretation
- Transaction preview

Sales

- Create confirmed sale
- List sales
- Retrieve sale details
- Correct or reverse sales

Inventory

- List products
- Create products
- Update products
- Record stock changes

Expenses

- Create expenses
- List expenses
- Expense summaries

Debts

- Customers
- Debts
- Repayments

Ajo

- Groups
- Members
- Contributions
- Payout records

Analytics

- Dashboard summaries
- Sales trends
- Expense summaries

Reports

- Business Activity Passport

Use Zod validation, authentication middleware, consistent JSON responses, and centralized error handling.

Verify Supabase access tokens server-side.

Never trust business IDs supplied by the frontend without verifying authorization.

---

11. ACCESSIBILITY AND RESPONSIVENESS

Beta serves users who may have limited digital literacy.

Accessibility is a core requirement, not an optional enhancement.

Implement:

- Large primary buttons
- Clear labels
- Readable typography
- Strong color contrast
- Keyboard navigation
- Visible focus indicators
- Screen-reader-friendly controls
- Accessible form errors
- Simple confirmation dialogs
- Clear transaction feedback
- Minimal steps for important actions

For mobile browsers:

- Optimize the checkout interface for one-handed use.
- Make microphone controls prominent.
- Use responsive cards instead of cramped tables.
- Ensure forms work with mobile keyboards.
- Avoid horizontal overflow.
- Account for mobile-browser microphone permissions and supported audio formats.

Do not assume every browser supports the same recording or speech features.

---

12. SECURITY AND PRIVACY

Implement:

- Supabase authentication
- Secure token verification
- Business-level authorization
- PostgreSQL Row Level Security
- Request validation
- Secure environment variables
- Appropriate CORS configuration
- API rate limiting
- Audio upload size limits
- Minimal audio retention
- Clear microphone permission handling
- Financial audit trails
- Transaction confirmation
- Duplicate-submission protection
- Safe error messages

Never expose N-ATLAS API credentials or Supabase service-role keys to the browser.

Do not record audio without an explicit user action.

Do not silently mix demonstration data with production financial data.

---

13. PERFORMANCE AND CODE QUALITY

Use:

- Reusable React components
- Feature-oriented organization
- Shared TypeScript types
- TanStack Query for server-state management
- Efficient database queries
- Lazy-loaded routes where useful
- Responsive images and optimized assets
- Proper loading and error states
- Clear API contracts

Avoid:

- Unnecessary dependencies
- Overengineering
- Repeated business logic
- Excessive abstraction
- Unused components
- Fake integrations
- Placeholder-only core features

Prioritize practical, maintainable implementation.

---

14. IMPLEMENTATION EXECUTION INSTRUCTIONS

THIS SECTION IS VERY IMPORTANT.

I have limited AI coding credits and need the application implemented efficiently.

Follow these instructions:

1. Inspect the existing repository before creating or changing files.
2. Read the complete implementation requirements.
3. Study the attached UI reference image.
4. Begin implementation immediately.
5. Do not produce a lengthy implementation plan.
6. Do not ask for approval after each component or feature.
7. Make reasonable implementation decisions autonomously.
8. Implement the React frontend, Express backend, PostgreSQL schema, and N-ATLAS adapter in one continuous workflow.
9. Reuse existing working code wherever possible.
10. Build shared components and reusable services.
11. Prioritize the real voice checkout and transaction recording workflow.
12. Implement simplified features without unnecessary complexity.
13. Clearly label mocked features.
14. Avoid unnecessary package installations.
15. Avoid repeated full build and test cycles when lightweight checks are sufficient.
16. Perform a consolidated verification pass after implementation.
17. Fix critical integration and build errors.
18. Do not fabricate successful tests or integrations.
19. Do not stop after building only the landing page.
20. Do not stop after building only the backend.
21. Deliver a connected, usable full-stack web application.

You may perform lightweight checks during implementation to prevent major errors, but avoid unnecessary repeated verification.

If external credentials are unavailable, complete all implementation work that does not require those credentials and report the blocker precisely.

---

15. REQUIRED ENVIRONMENT CONFIGURATION

Provide ".env.example" files for the frontend and backend.

Include the required Supabase, server, and N-ATLAS configuration.

Example:

# Frontend

VITE_API_BASE_URL=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Backend

PORT=5000
FRONTEND_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NATLAS_BASE_URL=
NATLAS_API_KEY=
NATLAS_ASR_MODEL=
NATLAS_LLM_MODEL=

Add other environment variables only when actually required.

Never commit real secrets.

---

16. DEPLOYMENT READINESS

Prepare the application for deployment.

The frontend should support deployment to Vercel or another compatible static web hosting provider.

The Express backend should support deployment to Render or another Node.js hosting provider.

Supabase will provide PostgreSQL and authentication.

Include:

- Production build scripts
- Start scripts
- Environment examples
- Database migrations
- CORS configuration
- API base URL configuration
- Basic health-check endpoint
- Concise setup instructions

Ensure the frontend does not depend on hardcoded localhost URLs in production.

---

17. ACCEPTANCE CRITERIA

The implementation is complete only when the following can be demonstrated:

1. A trader can register and log in.
2. A trader can create a business profile.
3. A trader can add products to inventory.
4. A trader can record a manual sale.
5. A trader can record a voice sale using N-ATLAS when valid API access is configured.
6. The system displays extracted transaction details before saving.
7. The backend calculates the total correctly.
8. Confirmed sales are saved in PostgreSQL.
9. Inventory updates after confirmed sales.
10. The dashboard displays real transaction data.
11. Expenses can be recorded and reviewed.
12. Debts and repayments can be tracked.
13. Ajo contributions can be recorded.
14. The Business Activity Passport can be generated.
15. Ambient checkout demo works and is visibly labeled as a simulation.
16. The application works on desktop, tablet, and mobile browsers.
17. The UI follows the attached design reference.
18. Authentication and business data isolation work correctly.
19. The frontend and backend compile successfully.
20. External integration blockers are accurately documented.

Do not claim that an untested external API integration has passed.

---

18. FINAL HANDOFF

After implementation, provide a concise report containing:

- Features implemented
- Features simplified
- Features mocked
- Build and test results
- Database migration status
- N-ATLAS integration status
- Required environment variables
- Local startup commands
- Deployment instructions
- Remaining blockers

Do not spend excessive tokens describing every file.

FINAL INSTRUCTION:

Build Beta as one complete, cohesive, full-stack React.js web application using TypeScript, Vite, Tailwind CSS, Node.js, Express.js, Supabase PostgreSQL, and N-ATLAS.

The frontend must be responsive and visually inspired by the attached reference image.

The backend must be functional, secure, and connected to the frontend.

The voice checkout must use real N-ATLAS integration when credentials are available.

Simplified features must work with real records, while mocked features must be clearly identified.

DO NOT CREATE A SEPARATE MOBILE APPLICATION.

DO NOT STOP AT A STATIC PROTOTYPE.

BEGIN IMPLEMENTATION IMMEDIATELY.
