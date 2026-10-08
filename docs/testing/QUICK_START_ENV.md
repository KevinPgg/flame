# Quick Start: Setting Up Test Environment Variables

## ✅ Already Have `.env.local`? You're Done!

If you already have `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, tests will work automatically!

```bash
pnpm test
```

## 🚀 Three Ways to Set Credentials

### Method 1: Use existing `.env.local` (Easiest - Already Set Up!)

```bash
# 1. Copy example file
cp .env.test.example .env.test

# 2. Edit with your credentials
# Edit .env.test and add:
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 3. Run tests (automatically loads .env.test)
pnpm test
```

### Method 2: Export in terminal (Current session only)

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
pnpm test
```

### Method 3: One-line export + test

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co" && \
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" && \
pnpm test
```

## 📍 Where to Get Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings → API**
4. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

## ✅ Verify Setup

```bash
# Check if variables are set
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Run a test that needs DB
pnpm test stage-progression-logic  # No DB needed
pnpm test stage-availability-functions  # Needs DB
```

## 🔍 Which Tests Need Database?

**Need DB:**
- ✅ `stage-availability-functions.test.ts`
- ✅ `hold-expiration-flow.test.ts`
- ✅ `payment-protection.test.ts`

**Don't Need DB:**
- ✅ `stage-progression-logic.test.ts` (pure logic)
- ✅ `availability-api.test.ts` (mocked)
- ✅ `real-time-availability-hook.test.ts` (mocked)

## 💡 Pro Tips

1. **Use `.env.test`** - It's the easiest and most reliable
2. **Never commit `.env.test`** - It's already in `.gitignore`
3. **Use a test database** - Don't test against production
4. **Tests skip gracefully** - If no credentials, DB tests skip (no errors)

## 🐛 Troubleshooting

**Tests skip even with credentials?**
```bash
# Check if .env.test exists
ls -la .env.test

# Check if variables are loaded
cat .env.test
```

**Still not working?**
```bash
# Try manual export
export NEXT_PUBLIC_SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
pnpm test
```

