const fs = require("fs");
const c = fs.readFileSync("_content.txt","utf8");
fs.writeFileSync("page.tsx",c);
console.log("Done");
