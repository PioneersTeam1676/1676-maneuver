# Page Help & Tutorial System

## Overview
The enhanced page help system supports both simple tooltips and full dialog tutorials with GIF demonstrations.

## Features

### 🔧 Simple Tooltips
- Quick help for basic pages
- Appears as fixed card in top-right corner
- Automatically used for short content (≤3 items)

### 📚 Advanced Dialog Tutorials  
- Full-screen dialog with rich content
- Support for GIF demonstrations
- Step-by-step instructions with numbered bullets
- Automatically used for longer content or when `useDialog: true`

## Usage

### 1. Adding Help Content
Edit `/src/lib/pageHelpConfig.ts`:

```typescript
"/your-page": {
  title: "Your Page Tutorial",
  useDialog: true, // Forces dialog mode
  content: [
    "![Demo GIF](./assets/tutorials/your-demo.gif)",
    "Overview of what this page does.",
    "1. First step to take",
    "2. Second step to take", 
    "3. Final step",
    "Additional tips and tricks."
  ]
}
```

### 2. Adding GIF Tutorials
1. Place GIF files in `/src/assets/tutorials/`
2. Reference them in content using markdown syntax:
   ```
   "![Alt Text](./assets/tutorials/your-demo.gif)"
   ```

### 3. Automatic Detection
The component automatically chooses dialog mode when:
- `useDialog: true` is set
- Content has more than 3 items
- Any content item is longer than 200 characters

## Icons & Visual Cues

- **Help Circle (❓)**: Help tooltips or dialogs
- **"Tutorial" Badge**: Indicates rich content available

## Content Formatting

### Step Numbers
Content starting with `1.`, `2.`, etc. automatically gets:
- Numbered circular badges
- Different text styling
- Proper spacing and alignment

### GIF Placeholders
While adding actual GIFs, placeholder cards show:
- Preview of what will be displayed
- GIF title and source path
- "Coming Soon" indicator

## Example Implementation

```typescript
// Simple tooltip (auto-detected)
"/simple-page": {
  title: "Quick Help",
  content: ["Short explanation", "Another tip"]
},

// Advanced tutorial with GIF
"/complex-page": {
  title: "Complete Tutorial", 
  useDialog: true,
  content: [
    "![Process Demo](./assets/tutorials/process.gif)",
    "This tutorial shows the complete workflow.",
    "1. Open the form by clicking the button",
    "2. Fill in all required fields", 
    "3. Review your entries carefully",
    "4. Submit when everything looks correct",
    "Pro tip: Save your work frequently!"
  ]
}
```

## Future Enhancements
- Video tutorial support
- Interactive overlays
- Progress tracking
- Contextual help triggers
- Analytics on help usage
