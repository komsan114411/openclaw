# Bank System Documentation

## Overview

The Bank Management System provides a centralized repository of Thai banks with their codes, names, colors, and logos. This system integrates with the Thunder API for automatic bank data synchronization and supports slip verification and slip template features.

## Key Features

### 1. Bank Data Management
- **Create Banks**: Manually add new banks with code, name, color, and logo
- **Update Banks**: Edit bank information including logo upload
- **Deactivate Banks**: Soft delete via `isActive` flag (hard deletion is disabled)
- **Search Banks**: Find banks by code, name, or short name

### 2. Thunder API Integration
- **Automatic Sync**: "Sync from Thunder API" button uses system's Slip API Key automatically
- **Bank Codes**: Syncs from https://api.thunder.in.th/v1/banks
- **Data Mapping**:
  - `code`: Bank code (e.g., KBANK, SCB, BBL)
  - `name.th`: Thai bank name
  - `name.en`: English bank name
  - `short`: Short name/abbreviation
  - `color`: Bank's brand color (hex code)
  - `logo`: Bank's logo URL

### 3. Logo Management
- **Upload**: Admin can upload custom bank logos (max 2MB, PNG/JPG/GIF)
- **Preview**: Visual preview before saving
- **Edit/Replace**: Can update existing logos
- **Storage**: Logos stored as base64 in database or fetched from URL

### 4. Display Features
- **Color Column**: Shows bank's brand color in the table
- **Logo Display**: Shows bank logo in table and forms
- **Active Status**: Badge indicating if bank is active or inactive

## Integration with Slip System

### Slip Verification
When verifying a slip image via Thunder API, the response includes bank information:
```json
{
  "sender": {
    "bank": {
      "code": "KBANK",
      "name": "ธนาคารกสิกรไทย",
      "short": "กสิกร"
    }
  },
  "receiver": {
    "bank": {
      "code": "SCB",
      "name": "ธนาคารไทยพาณิชย์",
      "short": "ไทยพาณิชย์"
    }
  }
}
```

### Slip Templates
Slip templates have a `showBankLogo` flag that controls whether to display bank logos in the response message:
- When enabled, the template can show sender and receiver bank logos
- Bank logos are fetched from the banks collection
- Templates can use bank colors for styling

### Bank Account Settings (Separate System)
**Important**: The Banks module is different from Payment Bank Accounts:
- **Banks Module**: Reference data for all Thai banks
- **Payment Bank Accounts**: Admin's actual bank accounts where users send payments
- System Settings manages payment bank accounts separately

## API Endpoints

### Public Endpoints
- `GET /api/banks` - Get all active banks
- `GET /api/banks/search?q=<query>` - Search banks
- `GET /api/bank-logo/:code` - Get bank logo by code

### Admin Endpoints (Require Authentication)
- `GET /api/admin/banks` - Get all banks (including inactive)
- `POST /api/admin/banks` - Create new bank
- `PUT /api/admin/banks/:id` - Update bank (including deactivation)
- `POST /api/admin/banks/:id/logo` - Upload bank logo
- `POST /api/admin/banks/sync-from-thunder` - Sync from Thunder API (uses system API key)
- `POST /api/admin/banks/init-defaults` - Initialize default Thai banks
- `POST /api/admin/banks/init-thunder-banks` - Import from Thunder API (manual API key)

## Database Schema

```typescript
{
  code: string;           // Unique bank code (e.g., "KBANK")
  name: string;          // Thai name (required)
  nameTh?: string;       // Thai name (optional duplicate)
  nameEn?: string;       // English name
  shortName?: string;    // Short name/abbreviation
  color?: string;        // Brand color (hex code)
  logoUrl?: string;      // External logo URL
  logoBase64?: string;   // Base64 encoded logo (stored locally)
  isActive: boolean;     // Active status (default: true)
  sortOrder: number;     // Display order (default: 0)
  createdAt: Date;
  updatedAt: Date;
}
```

## Security & Error Handling

### Protection Against Deletion
- No DELETE endpoint exists
- Banks can only be deactivated via `isActive` flag
- Prevents accidental data loss
- Maintains referential integrity with slip history

### Error Prevention
- Duplicate bank code prevention (unique index)
- Input validation for bank codes (uppercase letters and numbers)
- File size limits for logo uploads (2MB max)
- Image format validation (PNG, JPG, GIF only)
- Rate limiting on sync operations
- Duplicate click prevention in frontend

### API Key Management
- Thunder API sync uses system's Slip API Key from settings
- No need to manually enter API key
- Proper error messages if API key is not configured
- 401 errors show user-friendly message

## Usage Guidelines

### For Administrators

1. **Initial Setup**:
   - Configure Slip API Key in System Settings
   - Click "Sync from Thunder API" to import all Thai banks
   - Or use "Initialize Default Banks" for basic set

2. **Managing Banks**:
   - Use search to find specific banks
   - Click "Edit" to update bank information
   - Upload custom logos for better branding
   - Deactivate unused banks instead of deleting

3. **Regular Maintenance**:
   - Periodically sync with Thunder API to get updates
   - Check for new banks added by Thunder
   - Update logos as needed

### For Developers

1. **Using Banks in Code**:
   ```typescript
   // Inject BanksService
   constructor(private banksService: BanksService) {}
   
   // Get bank by code
   const bank = await this.banksService.getByCode('KBANK');
   
   // Get all active banks
   const banks = await this.banksService.getAll();
   
   // Get bank logo
   const logo = await this.banksService.getBankLogo('KBANK');
   ```

2. **In Slip Templates**:
   - Set `showBankLogo: true` to enable logo display
   - Use bank colors for template styling
   - Access bank data from slip verification results

## Troubleshooting

### Sync Errors
- **"Slip API Key not configured"**: Set up API key in System Settings
- **"API Key invalid"**: Check if the API key is correct and active
- **Network timeout**: Thunder API may be down, try again later
- **Partial import**: Some banks may fail individually, check error details

### Logo Issues
- **Upload fails**: Check file size (max 2MB) and format (PNG/JPG/GIF)
- **Logo not displaying**: Check if bank has `logoBase64` or valid `logoUrl`
- **Logo quality**: Upload higher resolution images for better display

### Frontend Issues
- **Table not loading**: Check backend API connectivity
- **Sync button not working**: Check if API key is configured
- **Can't edit bank**: Ensure you have admin role
- **Logo preview not showing**: Check browser console for errors

## Future Enhancements

Potential improvements for the bank system:
- [ ] Bulk import/export functionality
- [ ] Bank logo CDN integration
- [ ] Historical bank data tracking
- [ ] Bank service availability status
- [ ] Advanced search with filters
- [ ] Bank statistics dashboard
