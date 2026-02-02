# Dine-In Analytics Dashboard

A dashboard to analyze Waiter vs Dine In API performance with file history support.

## Features
- Upload CSV files for analysis
- Files are automatically saved to cloud storage
- Select from previously uploaded files
- All users can access saved files

## Deployment to Vercel

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dine-in-dashboard.git
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Click "Deploy"

### Step 3: Add Vercel Blob Storage
After deployment:
1. Go to your project on Vercel dashboard
2. Click "Storage" tab
3. Click "Create Database"
4. Select "Blob"
5. Give it a name (e.g., "dine-in-files")
6. Click "Create"
7. It will automatically add the `BLOB_READ_WRITE_TOKEN` environment variable

### Step 4: Redeploy
After adding Blob storage, redeploy:
1. Go to "Deployments" tab
2. Click the three dots on the latest deployment
3. Click "Redeploy"

## Local Development

```bash
npm install
npm run dev
```

Note: File saving won't work locally without setting up the `BLOB_READ_WRITE_TOKEN` environment variable.
