# 🚀 Vercel Deployment Guide

Complete guide to deploy your Music Annotation App to Vercel.

---

## 📋 Prerequisites

1. ✅ **GitHub Account** - Create one at [github.com](https://github.com)
2. ✅ **Vercel Account** - Sign up at [vercel.com](https://vercel.com) (use GitHub to sign in)
3. ✅ **Supabase Project** - Your existing Supabase project (already set up)

---

## 🔧 Step 1: Prepare Your Project

### 1.1 Check Environment Variables

Make sure you have a `.env` file locally with:
```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_KEY=your-anon-public-key
```

### 1.2 Test Build Locally

```bash
npm run build
```

✅ Should complete without errors and create a `build/` folder.

---

## 📦 Step 2: Push to GitHub

### 2.1 Initialize Git (if not already done)

```bash
cd music-annotations
git init
git add .
git commit -m "Initial commit - Music Annotation App"
```

### 2.2 Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Name: `music-annotations` (or your preferred name)
3. Set to **Private** (recommended for now)
4. Click **"Create repository"**

### 2.3 Push Code to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/music-annotations.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## 🌐 Step 3: Deploy to Vercel

### 3.1 Import Project

1. Go to [vercel.com](https://vercel.com)
2. Click **"Add New..."** → **"Project"**
3. Select **"Import Git Repository"**
4. Choose your `music-annotations` repository
5. Click **"Import"**

### 3.2 Configure Build Settings

Vercel should auto-detect Create React App settings:

```
Framework Preset: Create React App
Build Command: npm run build
Output Directory: build
Install Command: npm install
```

✅ **Leave these as default** - Vercel detects them automatically!

### 3.3 Add Environment Variables

**CRITICAL STEP:** Add your Supabase credentials:

1. Scroll down to **"Environment Variables"**
2. Add these two variables:

| Name | Value |
|------|-------|
| `REACT_APP_SUPABASE_URL` | `https://your-project.supabase.co` |
| `REACT_APP_SUPABASE_KEY` | `your-anon-public-key` |

**Where to find these:**
- Go to [Supabase Dashboard](https://app.supabase.com)
- Select your project
- Go to **Settings** → **API**
- Copy **Project URL** and **anon public key**

3. Make sure to add them for:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

### 3.4 Deploy!

1. Click **"Deploy"**
2. Wait 2-3 minutes ⏱️
3. Your site will be live at: `https://your-app.vercel.app`

---

## ✅ Step 4: Verify Deployment

### 4.1 Check Your Live Site

Visit: `https://your-app.vercel.app`

Test:
- ✅ Can you log in?
- ✅ Can you see your pieces?
- ✅ Can you create/join pieces?
- ✅ Can annotations load?

### 4.2 Check Browser Console

Open DevTools (F12) and check for errors:
- ✅ No Supabase connection errors
- ✅ No CORS errors
- ✅ No missing environment variables

---

## 🔄 Step 5: Future Updates

### 5.1 Automatic Deployments

Every time you push to GitHub, Vercel auto-deploys! 🎉

```bash
# Make changes to your code
git add .
git commit -m "Add new feature"
git push
```

Vercel automatically:
1. Detects the push
2. Builds your app
3. Deploys the new version
4. Updates your live site

### 5.2 Manual Deploy from Local

Or use Vercel CLI for instant deploys:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

---

## 🛡️ Step 6: Configure Supabase for Production

### 6.1 Update Allowed URLs

In **Supabase Dashboard**:

1. Go to **Authentication** → **URL Configuration**
2. Add your Vercel URL to:
   - **Site URL**: `https://your-app.vercel.app`
   - **Redirect URLs**: `https://your-app.vercel.app/**`

### 6.2 Update CORS (if needed)

If you get CORS errors:

1. Go to **Settings** → **API**
2. Scroll to **CORS Allowed Origins**
3. Add: `https://your-app.vercel.app`

---

## 🎨 Step 7: Custom Domain (Optional)

### 7.1 Add Your Domain

1. In Vercel dashboard, go to your project
2. Click **"Domains"**
3. Enter your domain (e.g., `music-annotations.com`)
4. Follow DNS instructions

### 7.2 Update Supabase

Add your custom domain to Supabase allowed URLs!

---

## 🐛 Troubleshooting

### Problem: "Environment variables not found"

**Solution:**
1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Verify `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_KEY` exist
3. Click **"Redeploy"** to trigger a new build

### Problem: "Supabase connection error"

**Solution:**
1. Check Supabase Dashboard → **Settings** → **API**
2. Verify URLs match exactly (include https://)
3. Check if anon key is correct
4. Ensure Supabase allows your Vercel domain

### Problem: "Build fails"

**Solution:**
1. Check Vercel build logs
2. Test `npm run build` locally
3. Ensure all dependencies are in `package.json`
4. Check for TypeScript/ESLint errors

### Problem: "Can't log in on deployed site"

**Solution:**
1. Supabase → **Authentication** → **URL Configuration**
2. Add Vercel URL to **Site URL** and **Redirect URLs**
3. May take a few minutes to propagate

### Problem: "PDF Worker error"

**Solution:**
Already handled! Your app uses the local PDF worker from `/public/pdf.worker.min.mjs`.

---

## 📱 Step 8: iPad Optimization Verification

Your app is already optimized for iPad! On deployment, verify:

✅ Touch interactions work smoothly
✅ Buttons are properly sized for touch
✅ Safe area insets display correctly
✅ Zoom/scroll behaves as expected

Test on actual iPad or use Safari's Responsive Design Mode.

---

## 🎉 You're Live!

Your Music Annotation App is now:
- ✅ Deployed to Vercel
- ✅ Automatically deploys on git push
- ✅ Connected to Supabase
- ✅ Accessible worldwide
- ✅ iPad optimized
- ✅ Free hosting (Vercel hobby plan)

**Share your app:**
```
https://your-app.vercel.app
```

---

## 📊 Vercel Dashboard Features

### Analytics
- View page visits
- Monitor performance
- Track Core Web Vitals

### Deployments
- See all past deployments
- Rollback to previous versions
- Preview branch deployments

### Logs
- Real-time function logs
- Build logs
- Runtime logs

---

## 🔐 Security Best Practices

1. ✅ **Never commit `.env` file** (already in `.gitignore`)
2. ✅ **Use environment variables** for all secrets (already done)
3. ✅ **Keep Supabase keys secure** (anon key is safe for public)
4. ✅ **Use RLS policies** on Supabase (already set up)
5. ✅ **Enable Vercel authentication** (optional, for private projects)

---

## 💰 Pricing

**Vercel Hobby Plan (FREE):**
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Automatic HTTPS
- ✅ Custom domains
- ✅ Perfect for this project!

**Supabase Free Tier:**
- ✅ 500MB database
- ✅ 1GB file storage
- ✅ 50,000 monthly active users
- ✅ Enough for classroom use!

---

## 📚 Useful Links

- **Your Vercel Dashboard**: [vercel.com/dashboard](https://vercel.com/dashboard)
- **Your Supabase Dashboard**: [app.supabase.com](https://app.supabase.com)
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **GitHub Repo**: `https://github.com/YOUR_USERNAME/music-annotations`

---

## 🆘 Need Help?

1. Check Vercel build logs
2. Check browser console (F12)
3. Check Supabase logs
4. Verify environment variables
5. Test locally with `npm run build`

---

Happy deploying! 🚀🎵

