claude "Implement fully automated LINE Chrome Extension login and API key extraction bot:

**Full Automation Requirements**:

 Automated Navigation to GSB NOW Chat**
- Wait for chat list to fully render
- Search for 'GSB NOW' in contact search box using page.type()
- Click on GSB NOW conversation using selector or text matching
- Wait for chat messages to load completely
- Scroll to load recent messages if needed

Automated Network Monitoring & Click Trigger**
- Enable Chrome DevTools Protocol Network tracking before any action
- Auto-click on chat or trigger message refresh to generate getRecentMessagesV2 API call
- Intercept network request in real-time
- Capture complete cURL (Bash) including all headers and cookies
- Extract and validate X-Line-Access, X-Hmac keys

