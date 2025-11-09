# Music Annotations App - Setup Guide

## Overview
This app implements requirements 3-5 for the music annotation system:
- ✅ **Requirement 3**: Interactive Sheet Layer with sticker uploads
- ✅ **Requirement 4**: Change Management with version history and conflict resolution
- ✅ **Requirement 5**: User Roles and Permissions with Supabase Auth

## Features Implemented

### 1. Sticker Upload (Requirement 3)
- Users can upload images/stickers by selecting files
- Stickers are stored in Supabase Storage
- Stickers are displayed as overlays on the canvas
- Supports switching between "Draw Dots" and "Upload Sticker" modes

### 2. Version History (Requirement 4)
- Simple list view showing all annotation changes
- Displays who created each annotation and when
- Groups annotations by date
- Shows annotation details (type, position, color, creator)

### 3. Conflict Detection & Resolution (Requirement 4)
- Automatic detection of overlapping annotations (within 30px threshold)
- Semi-automatic conflict resolution modal
- Users can choose to:
  - Keep their new annotation
  - Keep the existing annotation
  - Keep both annotations
- Shows who created the existing annotation for context

### 4. Authentication & Roles (Requirement 5)
- Supabase Auth integration with email/password
- User signup with name and role selection (student/teacher)
- Login/logout functionality
- User profile display showing name and role

### 5. Role-Based Permissions (Requirement 5)
- **Students**: Can only create/edit/delete their own annotations
- **Teachers**: Can create/edit/delete all annotations
- Visual indicators:
  - Blue border = Your annotations
  - Orange border = Others' annotations
- Filter options to view:
  - All annotations
  - Only your annotations
  - Only others' annotations
- Teacher mode indicator showing special permissions

## Database Setup

### Step 1: Run SQL Commands in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `database-setup.sql`
4. Click "Run" to execute all commands

This will:
- Create the `profiles` table for user roles
- Add version tracking columns to `annotations` table
- Create `annotation_history` table
- Set up Row Level Security (RLS) policies

### Step 2: Create Storage Bucket

1. Go to **Storage** in Supabase dashboard
2. Click **Create bucket**
3. Name: `stickers`
4. Make it **public**
5. Click **Create**

### Step 3: Configure Environment Variables

Make sure your `.env` file has:
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_KEY=your_supabase_anon_key
```

## Running the App

```bash
cd music-annotations
npm install
npm start
```

The app will open at `http://localhost:3000`

## Using the App

### First Time Setup
1. Click "Sign Up"
2. Enter your name, email, password
3. Select role (Teacher or Student)
4. After signup, log in with your credentials

### Adding Annotations
1. **Draw Dots Mode**:
   - Select "Draw Dots" from the Mode dropdown
   - Choose a color
   - Click anywhere on the canvas to place dots

2. **Upload Sticker Mode**:
   - Select "Upload Sticker" from the Mode dropdown
   - Click "Choose File" and select an image
   - The sticker will be placed on the canvas

### Saving Changes
- Click "Apply All Changes" button
- If conflicts are detected, a modal will appear
- Resolve each conflict by choosing an option
- Annotations will be saved to the database

### Viewing History
- Click "View History" button
- See all past annotations grouped by date
- View who created each annotation

### Filtering Annotations
- Use the "Show" dropdown to filter:
  - All Annotations
  - My Annotations
  - Others' Annotations

## Simple Code Style
The code follows a simple, straightforward approach:
- Minimal dependencies (only React and Supabase)
- Inline styles for easy customization
- Simple component structure
- No complex state management libraries
- Clear, readable function names

## Font
The app uses the **Gaegu** font throughout for a friendly, handwritten feel.

## Next Steps
If you want to enhance the app further:
- Add drag-and-drop to reposition stickers
- Implement real-time collaboration with Supabase Realtime
- Add more drawing tools (lines, shapes, freehand)
- Export annotations as PDF or image
- Add search/filter by creator name
- Implement undo/redo functionality

