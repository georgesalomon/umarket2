# UMarket – Student Marketplace

UMarket is a marketplace designed specifically for UMass students. It allows
students to create item listings, browse listings and request to
purchase items from other students. Access is restricted to users with a
`@umass.edu` email address via Supabase Auth hooks. This repository
implementation with a FastAPI backend and Next.js frontend.

## Features

- **Student‑only access:** Sign-ups are restricted to `umass.edu` email addresses
  using a Supabase Before User Created hook.
- **Authentication:** Users can register and sign in with email and password.
- **Item management:** Authenticated users can create, edit and delete
  marketplace listings. Listings include a title, description, price, category
  and condition.
- **Browse listings:** Anyone can view all available items. Individual item
  pages show full details and allow logged‑in users to submit a purchase
  request.
- **Purchase requests:** Buyers can send a request to purchase an item. Each
  request records the buyer, seller and current status.

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
│   ├── pages/       # React pages
│   │   ├── index.js
│   │   ├── login.js
│   │   └── items/
│   │       ├── new.js
│   │       └── [id].js
│   ├── utils/
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
3. **Create tables** in the Supabase SQL editor. The following SQL defines
   minimal `items` and `orders` tables along with row‑level security (RLS)
   policies to ensure users can only modify their own data:

   ```sql
   -- Items table stores marketplace listings
   create table if not exists public.items (
     id serial primary key,
     user_id uuid references auth.users(id) on delete cascade,
     title text not null,
     description text not null,
     price numeric not null check (price >= 0),
     category text not null,
     condition text not null,
     status text not null default 'available',
     created_at timestamp with time zone default now(),
     updated_at timestamp with time zone
   );

   -- Orders table stores purchase requests
   create table if not exists public.orders (
     id serial primary key,
     item_id integer references public.items(id) on delete cascade,
     buyer_id uuid references auth.users(id) on delete cascade,
     seller_id uuid references auth.users(id) on delete cascade,
     status text not null default 'pending',
     created_at timestamp with time zone default now()
   );

   -- Enable RLS and allow owners to manage their own items
   alter table public.items enable row level security;
   create policy "Allow item owners read and write access" on public.items
     for all using (auth.uid() = user_id);

   -- Allow all authenticated users to read items
   create policy "Allow read access for all" on public.items
     for select using (auth.role() = 'authenticated');

   -- Enable RLS for orders and allow buyers or sellers to read their orders
   alter table public.orders enable row level security;
   create policy "Allow buyers and sellers access" on public.orders
     for select using (auth.uid() = buyer_id or auth.uid() = seller_id);
   create policy "Allow buyers to create orders" on public.orders
     for insert using (auth.uid() = buyer_id);
   create policy "Allow sellers to update order status" on public.orders
     for update using (auth.uid() = seller_id);
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

## Running the backend

1. Copy the example environment file and set your Supabase credentials:

   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env and set SUPABASE_URL and SUPABASE_API_KEY
   ```

2. Install dependencies and start the server (requires Python 3.10+):

   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
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

   ```bash
   cd frontend
   cp .env.local.example .env.local
   # Edit .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

2. Install dependencies and start the development server:

   ```bash
   npm install
   npm run dev
   ```

3. Visit `http://localhost:3000` in your browser to view the site.


