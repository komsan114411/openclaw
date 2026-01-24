claude "Improve the slip template design based on the uploaded image requirements:

1. **Slip Template Redesign**:
   - Add green header with checkmark icon and 'สลิปถูกต้อง' text (matching the uploaded example)
   - Display amount (B200) in large, bold dark blue font
   - Show date/time in gray subtitle format (24 ม.ค. 69, 17:12 น.)
   - Add sender section with bank icon, name ('ผู้โอน'), and recipient info
   - Add receiver section with bank icon, name ('ผู้รับ'), and account details
   - Include PromptPay logo at bottom with verification text ('สลิปจริงตรวจสอบโดย ธนาคาร ใบสุชิน ผู้ให้บริการเช็คสลิปอันดับ 1')
   - Use rounded corners, proper spacing, and modern card design
   - Support both valid and invalid slip states with different header colors/text

2. **Admin Panel - Slip Configuration**:
   - Create settings page for configuring bottom text
   - Add fields: Company name, verification text, custom footer message
   - Store settings in MongoDB
   - Apply settings dynamically to all generated slips

3. **Implementation**:
   - Update slip generation API to fetch settings from database
   - Create React component for slip preview with all design elements
   - Add Thai bank logos and PromptPay logo assets
   - Ensure responsive design for mobile viewing
   - Add CSS/Tailwind classes for exact styling match

4. **Database Schema**:
   - Add SlipSettings collection with fields: companyName, verificationText, footerMessage, isActive
   - Include default values matching the example

Fix any bugs during implementation and ensure the design perfectly matches the uploaded image example."