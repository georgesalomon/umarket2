# UMarket – Student Marketplace

UMarket is a marketplace designed specifically for UMass students. It allows
students to create item listings, browse listings and request to
purchase items from other students. Access is restricted to users with a
`@umass.edu` email address via Supabase Auth hooks. This repository
implements a FastAPI backend and Next.js frontend.

## Features

- **Student‑only access:** Sign-ups are restricted to `umass.edu` email addresses
  using a Supabase Before User Created hook.
- **Google authentication:** Students sign in with Supabase Google OAuth (including
  Google One Tap). Tokens are verified by the FastAPI backend.
- **Listing management:** Authenticated users can create, edit, delete, and toggle
  availability for their listings while tracking quantity remaining.
- **Browse listings:** Anyone can view all available items. Individual pages show full
  details and, when authenticated, allow students to request a purchase.
- **Purchase workflow:** Buyers record purchases for available items and choose a
  preferred payment method. Quantities decrement automatically and listings are marked
  sold when inventory reaches zero.
- **Student profiles:** Sellers manage a public profile, including avatars stored in a Supabase
  Storage bucket and short bios shared on listing detail pages.

## Project structure

``` 
umarket/
├── backend/         # FastAPI application
│   ├── main.py      # API routes
│   ├── database.py  # Supabase REST helpers
│   ├── schemas.py   # Pydantic models
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/        # Next.js application
│   ├── components/
│   │   ├── GoogleButton.jsx
│   │   ├── GoogleOneTap.jsx
│   │   ├── Layout.jsx
│   │   └── ListingForm.jsx
│   ├── context/
│   │   └── AuthContext.js
│   ├── pages/
│   │   ├── _app.js
│   │   ├── index.js
│   │   ├── login.js
│   │   ├── dashboard/
│   │   │   ├── listings.js
│   │   │   ├── orders.js
│   │   │   └── profile.js
│   │   ├── items/
│   │   │   ├── [id].js
│   │   │   ├── [id]/edit.js
│   │   │   └── new.js
│   │   └── users/
│   │       └── [id].js
│   ├── utils/
│   │   ├── apiClient.js
│   │   └── supabaseClient.js
│   ├── styles/
│   │   └── globals.css
│   ├── package.json
│   ├── next.config.js
│   └── .env.local.example
└── README.md        # Project overview (this file)
```

## Supabase setup

1. Create a new Supabase project or use your existing one.
2. **Restrict sign‑ups to `@umass.edu`**:
   - Navigate to **Authentication → Configuration → Auth Hooks (Beta)** in
     the Supabase dashboard.
   - Create a *Before User Created* hook and attach the `restrict_signup_to_umass`
     Postgres function. The SQL for this function is included below.
   - Toggle the hook to **enabled**.
3. **Create tables** in the Supabase SQL editor. The base app relies on the
   `Product` and `Transactions` tables. The SQL below sets up the core data model
   (including the `category` column required by the app) and row-level security (RLS) policies:

   ```sql
   -- Core product table (one row per marketplace item)
   create extension if not exists pgcrypto; -- ensures gen_random_uuid()

   create table if not exists public."Product" (
     prod_id uuid primary key default gen_random_uuid(),
     seller_id uuid references auth.users(id) on delete cascade,
     name text not null,
     price numeric not null check (price >= 0),
     quantity integer not null default 1 check (quantity >= 0),
     category text not null default 'miscellaneous',
     sold boolean not null default false,
     created_at timestamptz not null default now()
   );

   -- Optional category tables (Clothing, Decor, etc.) can reference prod_id
   -- via foreign keys; only the base Product table is required for the app.

   create table if not exists public."Transactions" (
     id bigserial primary key,
     prod_id uuid references public."Product"(prod_id) on delete cascade,
     buyer_id uuid references auth.users(id) on delete cascade,
     payment_method text,
     created_at timestamptz not null default now()
   );

   -- RLS: anyone can read products, only the owner can modify their listings
   alter table public."Product" enable row level security;
   create policy "Products readable by all" on public."Product"
     for select using (true);
   create policy "Sellers manage their products" on public."Product"
     using (auth.uid() = seller_id)
     with check (auth.uid() = seller_id);

   -- RLS for transactions: buyers and sellers can view, buyers insert rows
   alter table public."Transactions" enable row level security;
   create policy "Participants can view transactions" on public."Transactions"
     for select using (
       auth.uid() = buyer_id
       or auth.uid() = (
         select seller_id from public."Product" p where p.prod_id = "Transactions".prod_id
       )
     );
   create policy "Buyers can create transactions" on public."Transactions"
     for insert with check (auth.uid() = buyer_id);
   ```

4. **Create the `restrict_signup_to_umass` function** in Supabase:

   ```sql
   create or replace function public.restrict_signup_to_umass(event jsonb)
   returns jsonb
   language plpgsql
   as $$
   declare
     email text;
     domain text;
   begin
     email := event -> 'user' ->> 'email';
     domain := split_part(email, '@', 2);
     if domain <> 'umass.edu' then
       return jsonb_build_object(
         'error', 'Only email addresses ending in "umass.edu" can sign up',
         'status', 400
       );
     end if;
     return '{}'::jsonb;
   end;
   $$;
   ```

   Afterwards, enable a Before User Created hook using this function via
   **Authentication → Configuration → Auth Hooks (Beta)**.
5. **Set up the avatars storage bucket**:
   - Go to **Storage → Buckets** and create a bucket named `avatars` (or any name you prefer).
   - Mark the bucket as **public** so listing pages can display profile photos.
   - In **Policies**, allow authenticated users to upload/update files within their folder scope.
   - If you choose a different bucket name, update the frontend and backend environment variables
     called `NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET` and `SUPABASE_AVATAR_BUCKET` to match.

## Running the backend

1. Copy the example environment file and set your Supabase credentials:

   macOS/Linux:
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env and set SUPABASE_URL, SUPABASE_API_KEY, SUPABASE_JWT_SECRET, FRONTEND_URLS
   ```

   Windows (PowerShell):
   ```powershell
   Copy-Item backend/.env.example backend/.env
   # Edit backend/.env and set SUPABASE_URL, SUPABASE_API_KEY, SUPABASE_JWT_SECRET, FRONTEND_URLS
   ```

   If your Supabase tables use different names or primary key columns, you can
   override the defaults by setting `SUPABASE_PRODUCTS_TABLE`,
   `SUPABASE_PRODUCT_ID_FIELD`, `SUPABASE_TRANSACTIONS_TABLE`, or
   `SUPABASE_TRANSACTION_ID_FIELD` in `backend/.env`. Set `SUPABASE_AVATAR_BUCKET`
   if you created a storage bucket name that differs from `avatars`.

2. Install dependencies and start the server (requires Python 3.10+):

   macOS/Linux:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

   Windows (PowerShell):
   ```powershell
   Set-Location backend
   python -m venv venv
   .\venv\Scripts\Activate
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

3. The API will be available at `http://localhost:8000`. See the automatic
   OpenAPI documentation at `http://localhost:8000/docs`.

Alternatively, build and run using Docker:

```bash
docker build -t umarket-backend ./backend
docker run -p 8000:8000 --env-file backend/.env umarket-backend
```

## Running the frontend

1. Copy the example environment file and set your Supabase project values:

   macOS/Linux:
   ```bash
   cd frontend
   cp .env.local.example .env.local
   # Edit .env.local and set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   # NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_API_BASE, and NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET
   ```

   Windows (PowerShell):
   ```powershell
   Set-Location frontend
   Copy-Item .env.local.example .env.local
   # Edit .env.local and set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   # NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_API_BASE, and NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET
   ```

2. Install dependencies and start the development server:

   ```bash
   npm install
   npm run dev
   ```

3. Visit `http://localhost:3000` in your browser to view the site.
