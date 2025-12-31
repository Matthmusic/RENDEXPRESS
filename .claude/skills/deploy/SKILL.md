---
name: deploy
description: Deploy Rendexpress to production by bumping version, updating changelog, committing changes, pushing to GitHub, building installer, and creating releases with automated upload. Use when deploying a new version of Rendexpress to production.
allowed-tools: Read, Edit, Write, Bash(npm:*), Bash(git:*), Bash(gh:*), Bash(*)
---

# Rendexpress Deployment Skill

Deploy Rendexpress to production with FULLY AUTOMATED version bumping, changelog updates, installer build, and GitHub releases.

## Prerequisites

- Git repository with all changes committed or stashed
- Current branch: main
- npm available in PATH
- GitHub token available (will check GITHUB_TOKEN or GH_TOKEN environment variables)

## Deployment Process

### Step 1: Confirm Version Number
Ask the user for the version number to deploy (e.g., "0.0.10"). The version should be in semantic versioning format (X.Y.Z).

### Step 2: Update Version Files
Update both package.json and cea-app.json with the new version number:

**In `electron-react/package.json`:**
- Read the file first
- Update the `version` field to the new version

**Update package-lock.json:**
- Run `npm install --package-lock-only` in the electron-react directory

**In `cea-app.json`:**
- Read the file first
- Update `app.version` to the new version
- Update the `installation.downloadUrl` to reference the new version: `Rendexpress-{VERSION}-Setup.exe`
- Add a new changelog entry at the TOP of the `changelog` object with:
  - Current date in YYYY-MM-DD format
  - Ask the user what changes to include in the changelog (provide examples like "Fix version display", "Add new feature", etc.)

### Step 3: Review Changes
Show the user a summary of all changes made and ask for confirmation before committing.

### Step 4: Commit Changes
Run these git commands in order:
```bash
cd "c:\DEV\ToolBox CEAI\projects\rendexpress"
git add cea-app.json electron-react/package-lock.json electron-react/package.json
git commit -m "chore: bump version to {VERSION}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### Step 5: Push to GitHub
```bash
cd "c:\DEV\ToolBox CEAI\projects\rendexpress"
git push
```

If push fails due to no upstream branch, use:
```bash
git push --set-upstream origin main
```

### Step 6: Create Git Tag and Push
```bash
cd "c:\DEV\ToolBox CEAI\projects\rendexpress"
git tag v{VERSION}
git push origin v{VERSION}
```

### Step 7: Build the Electron Installer
Build the Windows installer with electron-builder:
```bash
cd "c:\DEV\ToolBox CEAI\projects\rendexpress\electron-react"
npm run build:electron
```

This will create the installer at: `electron-react/dist/Rendexpress-{VERSION}-Setup.exe`

Wait for the build to complete (may take 1-2 minutes). Show progress to the user.

### Step 8: Create GitHub Release and Upload Installer

**IMPORTANT**: This step MUST be fully automated. The user should not have to do anything manually.

Format the changelog notes from cea-app.json into a nice release description:
```markdown
## Nouveautés

{LIST_OF_CHANGES_FROM_CHANGELOG}

## Installation

Téléchargez l'installeur ci-dessous et lancez-le pour installer Rendexpress sur votre machine Windows.
```

#### Option A: If `gh` CLI is available
```bash
cd "c:\DEV\ToolBox CEAI\projects\rendexpress"
gh release create v{VERSION} --title "v{VERSION}" --notes "{FORMATTED_CHANGELOG_NOTES}" "electron-react/dist/Rendexpress-{VERSION}-Setup.exe#Windows Installer"
```

#### Option B: Use PowerShell script (preferred if gh not available)
A PowerShell script is available at `.claude/skills/deploy/create-release.ps1` that handles the entire release creation and upload process.

```powershell
cd "c:\DEV\ToolBox CEAI\projects\rendexpress"
.\.claude\skills\deploy\create-release.ps1 -Version "{VERSION}" -ChangelogNotes "{FORMATTED_CHANGELOG_NOTES}"
```

This script will:
- Check for GitHub token (GITHUB_TOKEN or GH_TOKEN environment variable)
- If token not found, display instructions to create one
- Create the GitHub release using the GitHub API
- Upload the installer binary to the release
- Display the release URL when complete

The deployment skill MUST handle both cases automatically and complete the full deployment without user intervention.

## Important Notes

- Always use semantic versioning (e.g., 0.0.10, 0.1.0, 1.0.0)
- The version format in files is without the `v` prefix (e.g., "0.0.10")
- The git tag includes the `v` prefix (e.g., "v0.0.10")
- Both package.json and cea-app.json must be kept in sync
- The changelog in cea-app.json documents all changes for that version
- Each changelog entry includes `date` and `changes` array
- The downloadUrl in cea-app.json needs the exact version for GitHub releases

## Example Workflow

User: "/deploy" or "Deploy version 0.0.10"

1. Ask: "What version do you want to deploy?" (if not provided)
2. Ask: "What changes should I include in the changelog?"
3. Update all version files (package.json, package-lock.json, cea-app.json)
4. Show summary of changes and ask for confirmation
5. Commit and push to GitHub
6. Create and push git tag
7. Build the Electron installer (this takes 1-2 minutes)
8. Create GitHub release and upload installer automatically
9. Confirm completion with release URL

**The entire process is automated - the user does nothing except provide version and changelog.**

## Error Handling

- If any git command fails, stop and report the error to the user
- If GitHub token is not available and gh CLI is not installed, guide user to create token
- If build fails, show the full error output
- Always verify files were read successfully before editing
- Use TodoWrite to track deployment steps (version update, commit, push, build, release)
- If installer upload fails, retry once before reporting error

## GitHub Token Setup (if needed)

If no GitHub token or gh CLI is available, guide the user to:
1. Go to https://github.com/settings/tokens/new
2. Token description: "Rendexpress Deploy"
3. Scopes needed: `repo` (full control)
4. Generate token and save it
5. Set environment variable: `setx GITHUB_TOKEN "ghp_your_token_here"`
6. Restart Claude Code to load the new environment variable

After the token is set once, all future deployments will be fully automated.
