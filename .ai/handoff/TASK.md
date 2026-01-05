Help me fix the **"User Slip Templates" page** in this project.

**Current Status:**
The page is currently incomplete. It might be empty, broken, or showing Admin controls (like Edit/Delete) that a regular User shouldn't see.

**Your Task:**
Please rewrite the code for this page completely. You need to identify the correct file path yourself based on the project structure (look for the user-facing templates page).

**Requirements:**
1.  **Visual Preview (Most Important):** The user needs to see what the slip looks like. Create a **Mock UI** inside each card that simulates a real bank transfer slip (using HTML/Tailwind) based on the template's theme.
2.  **Grid Layout:** Display all templates in a responsive grid.
3.  **No Admin Controls:** Remove all "Edit", "Delete", or "Create" buttons. Users can only **"Select"** or **"Preview"**.
4.  **Mock Data:** Since the API might not be ready, hardcode an array of mock templates (e.g., 'Blue Theme', 'Dark Theme', 'Minimal') so the UI renders immediately.
5.  **Interaction:** When clicking "Select", just show a success toast for now.

**Output:**
Provide the full, ready-to-use code for the page component.